import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { TabsHistorial } from '../../components/historial/HistorialComun';
import { ACTIVIDAD, getResumenDia } from '../../repositories/actividad';
import { getRecibo } from '../../repositories/pagos';
import { imprimirPedido } from '../../services/pedidoPdf';
import { imprimirRecibo } from '../../services/reciboPdf';
import { formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const TABS = [
  { key: 'vendido', label: 'Vendido' },
  { key: 'cobrado', label: 'Cobrado' },
];

const FORMAS = [
  ['EFECTIVO', 'Efectivo'],
  ['CHEQUE', 'Cheque'],
  ['TRANSFERENCIA', 'Transferencia'],
  ['DEPOSITO', 'Depósito'],
];

// 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'.
const hora = (v) => /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0] ?? '';

const hoyLargo = () => new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

const suma = (lista) => lista.reduce((s, a) => s + a.monto, 0);

// Recuadro de total (Vendido / Cobrado) arriba de las pestañas. Tocarlo abre su pestaña.
function Total({ icono, titulo, monto, sub, activo, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.total, activo && styles.totalActivo, pressed && styles.pressed]}
    >
      <View style={styles.totalTop}>
        <MaterialCommunityIcons name={icono} size={18} color={activo ? colors.onPrimary : colors.primary} />
        <Text style={[styles.totalTitulo, activo && styles.textoActivo]}>{titulo}</Text>
      </View>
      <Text style={[styles.totalValor, activo && styles.textoActivo]} numberOfLines={1} adjustsFontSizeToFit>
        {formatMonto(monto)}
      </Text>
      <Text style={[styles.totalSub, activo && styles.textoActivo]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

// Card de un documento del día: título, cliente, detalle, monto y hora. Tocarla imprime su PDF.
function DocCard({ icono, color, titulo, item, lineas, etiqueta, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { borderLeftColor: color }, pressed && styles.pressed]}>
      <View style={[styles.cardIcono, { backgroundColor: `${color}1A` }]}>
        <MaterialCommunityIcons name={icono} size={18} color={color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitulo} numberOfLines={1}>{titulo}</Text>
        <Text style={styles.cardCliente} numberOfLines={1}>
          {item.nombre}{item.cliente && item.nombre !== item.cliente ? ` (${item.cliente})` : ''}
        </Text>
        {lineas.filter(Boolean).map((l, i) => (
          <Text key={i} style={styles.cardMeta} numberOfLines={1}>{l}</Text>
        ))}
        {etiqueta ? (
          <View style={[styles.etiqueta, { backgroundColor: etiqueta.fondo }]}>
            <Text style={[styles.etiquetaText, { color: etiqueta.color }]}>{etiqueta.texto}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.cardMonto}>{formatMonto(item.monto)}</Text>
        <Text style={styles.cardHora}>{hora(item.hora)}</Text>
        <Feather name="printer" size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function Vacio({ icono, texto }) {
  return (
    <View style={styles.empty}>
      <Feather name={icono} size={28} color={colors.textDisabled} />
      <Text style={styles.emptyText}>{texto}</Text>
    </View>
  );
}

// Reportes > Cobrado y Vendido: lo vendido y lo cobrado hoy en el equipo, sin conexión (bitácora
// REPORTE_ACTIVIDAD, la misma de Mi día; los documentos anulados ya no aparecen).
//   Vendido = pedidos nuevos + cotizaciones aprobadas (pasan a pedido).
//   Cobrado = recibos del día con el documento que pagaron y el total por forma de pago.
// Tocar un documento imprime su PDF (pedido o recibo): del servidor si ya se envió y hay conexión;
// si no, se arma en el equipo.
export default function CobradoVendidoReporteView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('vendido');
  const imprimiendo = useRef(false);

  // Todo sale de la base local: se lee una vez al abrir la pantalla.
  useEffect(() => {
    let cancelado = false;
    getResumenDia()
      .then((d) => {
        if (!cancelado) setDatos(d);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudo leer la actividad del día.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const resumen = useMemo(() => {
    if (!datos) return null;
    const porHora = (a, b) => String(b.hora).localeCompare(String(a.hora));
    const ventas = datos.actividad
      .filter((a) => a.tipo === ACTIVIDAD.pedido || a.tipo === ACTIVIDAD.aprobacion)
      .sort(porHora);
    const cobros = datos.actividad.filter((a) => a.tipo === ACTIVIDAD.cobro).sort(porHora);
    const formas = {};
    for (const c of cobros) {
      for (const [forma, monto] of Object.entries(c.detalle.formas ?? {})) formas[forma] = (formas[forma] ?? 0) + Number(monto);
    }
    const clientes = (lista) => new Set(lista.map((a) => `${a.ruta}|${a.cliente}`)).size;
    return {
      ventas,
      vendido: suma(ventas),
      clientesVenta: clientes(ventas),
      cobros,
      cobrado: suma(cobros),
      clientesCobro: clientes(cobros),
      cancelados: cobros.filter((c) => c.detalle.cancelado).length,
      formas,
    };
  }, [datos]);

  // PDF del documento: del servidor si ya se envió y hay conexión; si no, se arma en el equipo.
  const imprimir = async (item) => {
    if (imprimiendo.current) return;
    imprimiendo.current = true;
    try {
      if (item.tipo === ACTIVIDAD.cobro) {
        // La clave del cobro es el ID del pago (COBRO_PAGO).
        const recibo = await getRecibo(Number(item.clave));
        if (!recibo) throw new Error('El recibo ya no está en el equipo.');
        await imprimirRecibo(recibo);
        return;
      }
      await imprimirPedido({ ruta: item.ruta, numero: item.documento, cliente: item.cliente });
    } catch (e) {
      Alert.alert('No se pudo generar el PDF', e?.message || 'Intenta de nuevo.');
    } finally {
      imprimiendo.current = false;
    }
  };

  const articulos = (n) => (n ? `${n} ${n === 1 ? 'artículo' : 'artículos'}` : null);
  const de = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Lo vendido (pedidos y cotizaciones aprobadas) y lo cobrado (recibos) hoy en este equipo. Toca un documento para imprimirlo.'} title="Cobrado y Vendido" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dia}>
          <MaterialCommunityIcons name="calendar-today" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.diaTitulo}>Montos del día</Text>
            <Text style={styles.diaFecha}>{hoyLargo()}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {cargando ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}

        {resumen ? (
          <>
            <View style={styles.totales}>
              <Total
                icono="cart-check"
                titulo="Vendido"
                monto={resumen.vendido}
                sub={de(resumen.ventas.length, 'pedido', 'pedidos')}
                activo={tab === 'vendido'}
                onPress={() => setTab('vendido')}
              />
              <Total
                icono="cash-check"
                titulo="Cobrado"
                monto={resumen.cobrado}
                sub={de(resumen.cobros.length, 'recibo', 'recibos')}
                activo={tab === 'cobrado'}
                onPress={() => setTab('cobrado')}
              />
            </View>

            <TabsHistorial tab={tab} onChange={setTab} tabs={TABS} />

            {tab === 'vendido' ? (
              <>
                <Text style={styles.seccion}>
                  {resumen.ventas.length
                    ? `${de(resumen.ventas.length, 'PEDIDO', 'PEDIDOS')} · ${de(resumen.clientesVenta, 'CLIENTE', 'CLIENTES')}`
                    : 'PEDIDOS DE HOY'}
                </Text>
                {resumen.ventas.length ? (
                  resumen.ventas.map((v) => {
                    const aprobada = v.tipo === ACTIVIDAD.aprobacion;
                    return (
                      <DocCard
                        key={`${v.tipo}|${v.clave}`}
                        icono={aprobada ? 'file-check-outline' : 'cart-plus'}
                        color={aprobada ? '#3D6DB5' : colors.primary}
                        titulo={`Pedido ${v.documento}`}
                        item={v}
                        lineas={[articulos(v.detalle.articulos)]}
                        etiqueta={aprobada ? { texto: 'COTIZACIÓN APROBADA', fondo: '#E3EAF6', color: '#3D6DB5' } : null}
                        onPress={() => imprimir(v)}
                      />
                    );
                  })
                ) : (
                  <Vacio icono="shopping-cart" texto="Todavía no has vendido nada hoy." />
                )}
              </>
            ) : (
              <>
                {resumen.cobros.length ? (
                  <View style={styles.formas}>
                    <Text style={styles.seccion}>COBRADO POR FORMA DE PAGO</Text>
                    {FORMAS.filter(([k]) => resumen.formas[k] > 0).map(([k, nombre]) => (
                      <View key={k} style={styles.formaFila}>
                        <Text style={styles.formaNombre}>{nombre}</Text>
                        <Text style={styles.formaMonto}>{formatMonto(resumen.formas[k])}</Text>
                      </View>
                    ))}
                    <View style={[styles.formaFila, styles.formaTotal]}>
                      <Text style={styles.formaTotalNombre}>Total cobrado</Text>
                      <Text style={styles.formaTotalMonto}>{formatMonto(resumen.cobrado)}</Text>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.seccion}>
                  {resumen.cobros.length
                    ? `${de(resumen.cobros.length, 'DOCUMENTO COBRADO', 'DOCUMENTOS COBRADOS')} · ${resumen.cancelados} ${
                        resumen.cancelados === 1 ? 'CANCELADO' : 'CANCELADOS'
                      }`
                    : 'COBROS DE HOY'}
                </Text>
                {resumen.cobros.length ? (
                  resumen.cobros.map((c) => (
                    <DocCard
                      key={`${c.tipo}|${c.clave}`}
                      icono="cash"
                      color={colors.success}
                      titulo={`Documento ${c.documento}`}
                      item={c}
                      lineas={[c.detalle.recibo ? `Recibo ${c.detalle.recibo}` : null]}
                      etiqueta={
                        c.detalle.cancelado
                          ? { texto: 'CANCELADO', fondo: '#E3F2F1', color: colors.success }
                          : { texto: 'ABONO', fondo: '#FEEBD3', color: '#B85F00' }
                      }
                      onPress={() => imprimir(c)}
                    />
                  ))
                ) : (
                  <Vacio icono="dollar-sign" texto="Todavía no has cobrado documentos hoy." />
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.lg },
  error: { fontSize: 13, color: colors.error },
  pressed: { opacity: 0.7 },
  seccion: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  diaTitulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  diaFecha: { fontSize: 12, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  totales: { flexDirection: 'row', gap: spacing.sm },
  total: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 2,
  },
  totalActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  totalTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalTitulo: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, color: colors.textMuted },
  totalValor: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  totalSub: { fontSize: 12, color: colors.textMuted },
  textoActivo: { color: colors.onPrimary },
  formas: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  formaFila: { flexDirection: 'row', justifyContent: 'space-between' },
  formaNombre: { fontSize: 13, color: colors.text },
  formaMonto: { fontSize: 13, fontWeight: '700', color: colors.text },
  formaTotal: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  formaTotalNombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  formaTotalMonto: { fontSize: 14, fontWeight: '800', color: colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  cardIcono: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardCliente: { fontSize: 12, color: colors.text, marginTop: 1 },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  etiqueta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  etiquetaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  cardMonto: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardHora: { fontSize: 11, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
