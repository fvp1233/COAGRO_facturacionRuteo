import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import TextField from '../../components/ui/TextField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { historialStyles } from '../../components/historial/HistorialComun';
import {
  calcularLineaNC,
  calcularMontoNC,
  CODIGO_LINEA_MONTO,
  getDatosNotaCredito,
  getLineasCcf,
  getMontoCcf,
  guardarNotaCredito,
  IND_DEV,
  LARGO_RAZON_MONTO,
  LARGOS_ENC,
  MOTIVOS_NC,
  motivoNC,
} from '../../repositories/notasCredito';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { formatCantidad, formatFechaDoc, formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;
const etiquetaMotivo = (m) => `${m.codigo} - ${m.descripcion}`;

function Campo({ label, value, onChange, disabled }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={[styles.campoInput, disabled && styles.campoDisabled]}
        value={value}
        onChangeText={onChange}
        editable={!disabled}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textDisabled}
      />
    </View>
  );
}

// Una línea del CCF con lo que se puede acreditar y la captura (cantidad, estado o monto por unidad).
function LineaCard({ linea, captura, calculo, motivo, onChange }) {
  const sinSaldo = linea.disponible <= 0;
  const cambiar = (campo) => (v) => onChange({ ...captura, [campo]: v });
  const tieneCantidad = calculo.cantidad > 0;
  return (
    <View style={[styles.linea, sinSaldo && styles.atenuada, tieneCantidad && styles.lineaActiva]}>
      <Text style={styles.lineaNombre} numberOfLines={2}>{linea.descripcion || linea.codigo}</Text>
      <Text style={styles.lineaMeta}>
        {linea.codigo} · Precio CCF {formatMonto(linea.precio)}
        {linea.porcDescuento ? ` · Desc. ${formatPorcentaje(linea.porcDescuento)}` : ''}
      </Text>
      <Text style={styles.lineaMeta}>
        Facturado {formatCantidad(linea.facturado)} · Devuelto {formatCantidad(linea.devueltoErp + linea.pendiente)} ·{' '}
        <Text style={styles.disponible}>Disponible {formatCantidad(linea.disponible)}</Text>
      </Text>

      {sinSaldo ? (
        <Text style={styles.sinSaldo}>Ya no queda cantidad por acreditar de este artículo.</Text>
      ) : (
        <>
          <View style={styles.campos}>
            <Campo label={linea.empAlm || 'Almacén'} value={captura.almacen ?? ''} onChange={cambiar('almacen')} />
            {linea.factorVenta > 1 ? (
              <Campo
                label={`${linea.empDet || 'Detalle'} (${formatCantidad(linea.factorVenta)})`}
                value={captura.detalle ?? ''}
                onChange={cambiar('detalle')}
              />
            ) : null}
          </View>
          {motivo.devolucion && tieneCantidad ? (
            <View style={styles.estados}>
              {[
                { codigo: IND_DEV.bueno, texto: 'Buen estado' },
                { codigo: IND_DEV.malo, texto: 'Mal estado' },
              ].map((e) => {
                const activo = (captura.estado ?? IND_DEV.bueno) === e.codigo;
                return (
                  <Pressable
                    key={e.codigo}
                    onPress={() => onChange({ ...captura, estado: e.codigo })}
                    style={[styles.estado, activo && styles.estadoActivo]}
                  >
                    <Text style={[styles.estadoText, activo && styles.estadoTextActivo]}>{e.texto}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {tieneCantidad ? (
            calculo.error ? (
              <Text style={styles.lineaError}>{calculo.error}</Text>
            ) : (
              <Text style={styles.lineaTotal}>
                {formatCantidad(calculo.cantidad)} × {formatMonto(calculo.precio)} = {formatMonto(calculo.total)} con IVA
              </Text>
            )
          ) : null}
        </>
      )}
    </View>
  );
}

// Validar > Notas de crédito: paso 2, captura sobre el CCF elegido. Motivo (COD_MODIFICACION), razón
// (RAZON_MODIF) y observaciones (OBS_DEV) en todos los motivos. Luego:
// - 01 Devolución: por artículo del CCF, la cantidad a acreditar (nunca más de lo disponible), al
//   precio del CCF, y el estado de la mercadería.
// - 02, 03, 99: no se muestran los artículos. Se escribe el monto a acreditar CON IVA (nunca más de
//   lo que queda del CCF); se guarda como una línea '00000' con la razón como descripción.
// onGuardada(numero) al guardar.
// correccion (opcional, de getNotaCreditoParaCorregir + nota { compania, ruta, numero } y errorEnvio):
// corrige una NC sin enviar (p. ej. rechazada por el servidor). Se precarga con lo que tenía y se
// guarda con el mismo número.
export default function NotaCreditoCapturaView({ cliente, ruta, ccf, correccion = null, onBack, onGuardada }) {
  const insets = useSafeAreaInsets();
  const [inicio] = useState(() => new Date());
  const [datos, setDatos] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [motivo, setMotivo] = useState(correccion?.motivo ?? MOTIVOS_NC[0].codigo);
  const [razon, setRazon] = useState(correccion?.razon ?? '');
  const [observaciones, setObservaciones] = useState(correccion?.observaciones ?? '');
  // { [codigo]: { almacen, detalle, estado, precio } } (textos).
  const [capturas, setCapturas] = useState(correccion?.capturas ?? {});
  // 02, 03, 99: monto a acreditar con IVA (texto) y lo que queda del CCF (getMontoCcf).
  const [monto, setMonto] = useState(correccion?.monto ?? '');
  const [saldo, setSaldo] = useState(null);
  const corrige = correccion?.nota ?? null;
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    // Al corregir, la propia NC no cuenta como pendiente ni como ya acreditada del CCF.
    const excluir = corrige ? { ruta: corrige.ruta, numero: corrige.numero } : null;
    Promise.all([
      getDatosNotaCredito(cliente.codigo, ruta),
      getLineasCcf(cliente.codigo, ccf.compania, ccf.numero, excluir),
    ])
      .then(async ([d, l]) => {
        const s = await getMontoCcf(cliente.codigo, ccf.compania, ccf.numero, excluir, d?.cliente?.exentoVentas ?? 0);
        if (cancelado) return;
        setDatos(d);
        setLineas(l);
        setSaldo(s);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer las líneas del CCF.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.codigo, ruta, ccf.compania, ccf.numero]);

  const m = motivoNC(motivo);
  const calculos = useMemo(
    () => new Map(lineas.map((l) => [l.codigo, calcularLineaNC(l, capturas[l.codigo], m, datos?.cliente)])),
    [lineas, capturas, m, datos]
  );
  const porMonto = !m.devolucion;
  const calcMonto = useMemo(() => calcularMontoNC(monto, saldo), [monto, saldo]);
  const conCantidad = lineas.filter((l) => calculos.get(l.codigo)?.cantidad > 0);
  const totales = porMonto
    ? { base: calcMonto.base, descuento: 0, iva: calcMonto.iva, total: calcMonto.total }
    : conCantidad.reduce(
        (t, l) => {
          const c = calculos.get(l.codigo);
          return { base: t.base + c.base, descuento: t.descuento + c.descuento, iva: t.iva + c.iva + c.oi, total: t.total + c.total };
        },
        { base: 0, descuento: 0, iva: 0, total: 0 }
      );

  const guardar = () => {
    if (guardando) return;
    if (m.razonObligatoria && !razon.trim()) {
      Alert.alert('Nota de crédito', 'Escribe la razón de la nota de crédito.');
      return;
    }
    if (porMonto) {
      if (calcMonto.error) {
        Alert.alert('Nota de crédito', calcMonto.error);
        return;
      }
    } else {
      if (!conCantidad.length) {
        Alert.alert('Nota de crédito', 'Escribe la cantidad de al menos un artículo.');
        return;
      }
      const conError = conCantidad.find((l) => calculos.get(l.codigo).error);
      if (conError) {
        Alert.alert('Nota de crédito', `${conError.descripcion || conError.codigo}: ${calculos.get(conError.codigo).error}`);
        return;
      }
    }
    const detalle = porMonto
      ? `Monto con IVA · Total ${formatMonto(totales.total)}`
      : `${conCantidad.length} ${conCantidad.length === 1 ? 'artículo' : 'artículos'} · Total ${formatMonto(totales.total)}`;
    Alert.alert(
      corrige ? `Corregir nota de crédito ${corrige.numero}` : 'Guardar nota de crédito',
      `${m.descripcion} sobre el CCF ${ccf.numero}\n${detalle}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            setGuardando(true);
            try {
              const activa = await getRutaActiva();
              const numero = await guardarNotaCredito({
                ruta,
                cliente: cliente.codigo,
                bodega: activa?.bodegaErp ?? null,
                ccf,
                motivo,
                razon,
                observaciones,
                capturas: porMonto ? null : Object.fromEntries(conCantidad.map((l) => [l.codigo, capturas[l.codigo]])),
                monto: porMonto ? monto : null,
                inicio,
                fin: new Date(),
                corrige,
              });
              onGuardada?.(numero);
            } catch (e) {
              Alert.alert('No se pudo guardar la nota de crédito', e?.message || 'Error al guardar en la base local.');
            } finally {
              setGuardando(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Elige el motivo y escribe la razón. En devolución indica la cantidad por artículo; en rebaja, corrección u otro motivo escribe el monto con IVA, sin pasar del disponible del CCF.'} title={corrige ? 'Corregir nota de crédito' : 'Nota de crédito'} onBack={onBack} />

      <ScrollView contentContainerStyle={h.content} keyboardShouldPersistTaps="handled">
        <View style={styles.ccf}>
          <Text style={h.seccionLabel}>CRÉDITO FISCAL QUE SE AFECTA</Text>
          <Text style={styles.ccfNumero} selectable>{ccf.numero}</Text>
          <Text style={styles.ccfMeta}>
            {cliente.nombre} · {formatFechaDoc(ccf.fecha)} · {formatMonto(ccf.total)}
          </Text>
        </View>

        {corrige ? (
          <View style={styles.correccion}>
            <Text style={styles.correccionTitulo}>Corrigiendo la nota {corrige.numero}</Text>
            {correccion.errorEnvio ? <Text style={styles.correccionError}>{correccion.errorEnvio}</Text> : null}
            <Text style={styles.correccionTexto}>Se guarda con el mismo número y queda pendiente de enviar.</Text>
          </View>
        ) : null}

        {error ? <Text style={h.error}>{error}</Text> : null}

        <SelectField
          label="Motivo"
          value={etiquetaMotivo(m)}
          options={MOTIVOS_NC.map(etiquetaMotivo)}
          onChange={(t) => setMotivo(MOTIVOS_NC.find((x) => etiquetaMotivo(x) === t)?.codigo ?? motivo)}
        />
        <TextField
          label={m.razonObligatoria ? 'Razón (obligatoria)' : 'Razón'}
          value={razon}
          onChangeText={setRazon}
          // En 02, 03 y 99 la razón también es la descripción de la línea (máx. 80).
          maxLength={porMonto ? LARGO_RAZON_MONTO : LARGOS_ENC.RAZON_MODIF}
          placeholder={porMonto ? 'Descripción de la nota (va en la línea)' : m.descripcion}
          style={styles.texto}
        />
        <TextField
          label="Observaciones"
          value={observaciones}
          onChangeText={setObservaciones}
          maxLength={LARGOS_ENC.OBS_DEV}
          placeholder="Opcional"
          style={styles.texto}
        />

        <Text style={h.seccionLabel}>{porMonto ? 'MONTO A ACREDITAR' : 'ARTÍCULOS DEL CCF'}</Text>
        {cargando ? (
          <ActivityIndicator color={colors.primary} style={h.loading} />
        ) : porMonto ? (
          <View style={styles.monto}>
            <View style={styles.montoFila}>
              <Text style={styles.lineaMeta}>Total del CCF</Text>
              <Text style={styles.montoValor}>{formatMonto(saldo?.totalCcf ?? 0)}</Text>
            </View>
            <View style={styles.montoFila}>
              <Text style={styles.lineaMeta}>Ya acreditado en otras notas</Text>
              <Text style={styles.montoValor}>{formatMonto(saldo?.acreditado ?? 0)}</Text>
            </View>
            <View style={styles.montoFila}>
              <Text style={[styles.lineaMeta, styles.disponible]}>Disponible</Text>
              <Text style={[styles.montoValor, styles.disponible]}>{formatMonto(saldo?.disponible ?? 0)}</Text>
            </View>
            <View style={styles.montoLinea}>
              <Text style={styles.montoCodigo}>{CODIGO_LINEA_MONTO}</Text>
              <Text style={styles.lineaNombre} numberOfLines={2}>{razon.trim() || 'Escribe la razón arriba'}</Text>
            </View>
            <Campo label="Monto a acreditar (con IVA)" value={monto} onChange={setMonto} />
            {monto && calcMonto.error ? <Text style={styles.lineaError}>{calcMonto.error}</Text> : null}
          </View>
        ) : lineas.length ? (
          lineas.map((l) => (
            <LineaCard
              key={l.codigo}
              linea={l}
              motivo={m}
              captura={capturas[l.codigo] ?? {}}
              calculo={calculos.get(l.codigo)}
              onChange={(c) => setCapturas((prev) => ({ ...prev, [l.codigo]: c }))}
            />
          ))
        ) : (
          <View style={h.empty}>
            <Feather name="package" size={28} color={colors.textDisabled} />
            <Text style={h.emptyText}>El CCF no tiene líneas de venta guardadas en el equipo.</Text>
          </View>
        )}

        <View style={styles.totales}>
          {[
            ['Sin IVA', totales.base],
            ['Descuento', totales.descuento],
            ['Impuestos', totales.iva],
          ].map(([label, valor]) => (
            <View key={label} style={styles.totalRow}>
              <Text style={styles.totalLabel}>{label}</Text>
              <Text style={styles.totalValor}>{formatMonto(valor)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, styles.totalFuerte]}>Total a acreditar</Text>
            <Text style={[styles.totalValor, styles.totalGrande]}>{formatMonto(totales.total)}</Text>
          </View>
        </View>

        <PrimaryButton
          title={corrige ? 'Guardar corrección' : 'Guardar nota de crédito'}
          icon="save-outline"
          loading={guardando}
          onPress={guardar}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  ccf: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  ccfNumero: { fontSize: 17, fontWeight: '800', color: colors.text },
  ccfMeta: { fontSize: 12, color: colors.textMuted },
  monto: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 6,
  },
  montoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  montoValor: { fontSize: 13, fontWeight: '600', color: colors.text },
  montoLinea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  montoCodigo: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  correccion: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.sm + 4,
    gap: 4,
  },
  correccionTitulo: { fontSize: 13, fontWeight: '700', color: colors.text },
  correccionError: { fontSize: 12, color: colors.error },
  correccionTexto: { fontSize: 12, color: colors.textMuted },
  texto: { marginBottom: 0 },
  linea: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 4,
  },
  lineaActiva: { borderColor: colors.primary },
  atenuada: { opacity: 0.55 },
  lineaNombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  lineaMeta: { fontSize: 12, color: colors.textMuted },
  disponible: { fontWeight: '700', color: colors.success },
  sinSaldo: { fontSize: 12, color: colors.warning, marginTop: 2 },
  campos: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  campo: { flex: 1 },
  campoLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  campoInput: {
    height: 40,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  campoDisabled: { opacity: 0.5 },
  estados: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  estado: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  estadoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  estadoText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  estadoTextActivo: { color: colors.onPrimary },
  lineaError: { fontSize: 12, color: colors.error, marginTop: 2 },
  lineaTotal: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 2 },
  totales: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  totalValor: { fontSize: 14, color: colors.text },
  totalFuerte: { fontWeight: '700', color: colors.text },
  totalGrande: { fontSize: 16, fontWeight: '800', color: colors.primary },
});
