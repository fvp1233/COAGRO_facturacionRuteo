import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { eliminarPagoSinRecibo, getRecibo } from '../../repositories/pagos';
import { compartirReciboPdf, filasRecibo, partesFecha, textoCuenta } from '../../services/reciboPdf';
import { formatMonto } from '../../utils/formato';
import { montoALetras } from '../../utils/numeroALetras';
import { colors, radius, spacing } from '../../theme';

function Caja({ label, valor, flex }) {
  return (
    <View style={[styles.caja, flex && styles.flex]}>
      <Text style={styles.cajaLabel}>{label}</Text>
      <Text style={styles.cajaValor} numberOfLines={1}>{valor || '—'}</Text>
    </View>
  );
}

function Dato({ label, valor }) {
  if (!valor) return null;
  return (
    <View style={styles.dato}>
      <Text style={styles.datoLabel}>{label}</Text>
      <Text style={styles.datoValor}>{valor}</Text>
    </View>
  );
}

// Recibo de un pago (mismo contenido que el recibo físico) con el botón para compartirlo en PDF.
export default function ReciboView({ idPago, onBack }) {
  const insets = useSafeAreaInsets();
  const [recibo, setRecibo] = useState(null);
  const [error, setError] = useState('');
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getRecibo(idPago)
      .then((r) => {
        if (cancelado) return;
        if (r) setRecibo(r);
        else setError('No se encontró el recibo.');
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudo leer el recibo.');
      });
    return () => {
      cancelado = true;
    };
  }, [idPago]);

  // Pago de prueba de antes de los recibos (sin número y sin enviar): se puede eliminar del equipo.
  const esPrueba = Boolean(recibo && !recibo.recibo && !recibo.enviado);

  const eliminar = () =>
    Alert.alert(
      'Eliminar pago de prueba',
      `Se eliminará del equipo el pago de ${formatMonto(recibo.monto)} al documento ${recibo.documento}. ` +
        'No tiene recibo ni se envió al servidor, así que no afecta nada más. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await eliminarPagoSinRecibo(recibo.id);
              onBack();
            } catch (e) {
              Alert.alert('No se pudo eliminar', e?.message || 'Intenta de nuevo.');
            }
          },
        },
      ]
    );

  const compartir = async () => {
    if (!recibo || generando) return;
    setGenerando(true);
    try {
      await compartirReciboPdf(recibo);
    } catch (e) {
      Alert.alert('No se pudo generar el PDF', e?.message || 'Intenta de nuevo.');
    } finally {
      setGenerando(false);
    }
  };

  const f = partesFecha(recibo?.fecha);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Recibo" onBack={onBack} />

      {!recibo ? (
        error ? (
          <Text style={[styles.error, styles.content]}>{error}</Text>
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        )
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hoja}>
            <View style={styles.encabezado}>
              <View style={styles.flex}>
                <Text style={styles.empresa}>COMERCIAL AGROPECUARIA S.A DE C.V</Text>
                <Text style={styles.sub}>Compra y Venta de Productos Agrícolas y Veterinarios</Text>
              </View>
              <View style={styles.numero}>
                <Text style={styles.reciboLabel}>RECIBO</Text>
                <Text style={styles.reciboNum}>Nº {recibo.recibo}</Text>
              </View>
            </View>

            <View style={styles.fila}>
              <Caja label="Día" valor={f.dia} />
              <Caja label="Mes" valor={f.mes} />
              <Caja label="Año" valor={f.anio} />
              <Caja label="Monto" valor={formatMonto(recibo.monto)} flex />
            </View>
            <View style={styles.fila}>
              <Caja label="Cliente" valor={recibo.cliente} flex />
              <Caja label="Técnico" valor={recibo.tecnico} flex />
            </View>

            <View style={styles.linea}>
              <Text style={styles.lineaLabel}>RECIBIMOS DE</Text>
              <Text style={styles.lineaValor}>{recibo.nombreCliente}</Text>
            </View>
            <View style={styles.linea}>
              <Text style={styles.lineaLabel}>LA SUMA DE</Text>
              <Text style={styles.lineaValor}>{montoALetras(recibo.monto)}</Text>
            </View>

            <Text style={styles.tipoPago}>TIPO DE PAGO</Text>
            {filasRecibo(recibo).map((x, i) => (
              <View key={i} style={styles.renglon}>
                {x.factura ? (
                  <View style={styles.renglonTop}>
                    <Text style={styles.factura}>Factura {x.factura}</Text>
                    <View style={[styles.estado, recibo.cancelado ? styles.estadoCancelado : styles.estadoAbono]}>
                      <Text style={[styles.estadoText, { color: recibo.cancelado ? colors.success : '#B85F00' }]}>
                        {x.estado}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.datos}>
                  <Dato label="Efectivo" valor={x.efectivo ? formatMonto(x.efectivo) : ''} />
                  <Dato label="Transferencia" valor={x.transferencia ? formatMonto(x.transferencia) : ''} />
                  <Dato label="Depósito" valor={x.deposito ? formatMonto(x.deposito) : ''} />
                  <Dato label="Cheque" valor={x.cheque ? formatMonto(x.cheque) : ''} />
                  <Dato label="Número" valor={x.numero} />
                  <Dato label="Banco" valor={x.banco} />
                  <Dato label="Fecha" valor={x.fecha} />
                </View>
              </View>
            ))}
            {recibo.formas
              .filter((x) => x.forma === 'TRANSFERENCIA' || x.forma === 'DEPOSITO')
              .map((x, i) => (
                <Text key={i} style={styles.sub}>
                  {x.forma === 'DEPOSITO' ? 'Boleta' : 'Transferencia'} Nº {x.transaccion}
                </Text>
              ))}

            <View style={styles.total}>
              <Text style={styles.totalLabel}>TOTAL</Text>
              <Text style={styles.totalValor}>{formatMonto(recibo.monto)}</Text>
            </View>
            <Text style={styles.sub}>
              {textoCuenta(recibo)}
            </Text>
            {recibo.notas ? <Text style={styles.sub}>Notas: {recibo.notas}</Text> : null}
            <Text style={styles.sub}>
              {recibo.enviado ? 'Enviado al servidor' : 'Pendiente de enviar (Datos > Enviar Datos)'}
            </Text>
          </View>
        </ScrollView>
      )}

      <View style={styles.footer}>
        {esPrueba ? (
          <Pressable
            onPress={eliminar}
            style={({ pressed }) => [styles.botonEliminar, pressed && styles.pressed]}
          >
            <Feather name="trash-2" size={18} color={colors.primary} />
            <Text style={styles.botonEliminarText}>Eliminar pago de prueba</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={compartir}
          disabled={!recibo || generando}
          style={({ pressed }) => [styles.boton, (!recibo || generando) && styles.deshabilitado, pressed && styles.pressed]}
        >
          {generando ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Feather name="share-2" size={18} color={colors.onPrimary} />
          )}
          <Text style={styles.botonText}>Compartir PDF</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md },
  loading: { marginTop: spacing.xl },
  flex: { flex: 1 },
  hoja: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  encabezado: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  empresa: { fontSize: 14, fontWeight: '800', color: colors.text },
  sub: { fontSize: 11, color: colors.textMuted },
  numero: { alignItems: 'flex-end' },
  reciboLabel: { fontSize: 12, fontWeight: '800', color: colors.text },
  reciboNum: { fontSize: 20, fontWeight: '800', color: colors.primary },
  fila: { flexDirection: 'row', gap: spacing.xs + 2 },
  caja: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minWidth: 48,
  },
  cajaLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted },
  cajaValor: { fontSize: 14, fontWeight: '700', color: colors.text },
  linea: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 4 },
  lineaLabel: { fontSize: 10, fontWeight: '700', color: colors.success },
  lineaValor: { fontSize: 14, color: colors.text, marginTop: 1 },
  tipoPago: { fontSize: 12, fontWeight: '800', color: colors.success, textAlign: 'center', marginTop: spacing.xs },
  renglon: { backgroundColor: colors.surface, borderRadius: radius.sm + 2, padding: spacing.sm + 2, gap: spacing.xs },
  renglonTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  factura: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  estado: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  estadoCancelado: { backgroundColor: '#E3F2F1' },
  estadoAbono: { backgroundColor: '#FEEBD3' },
  estadoText: { fontSize: 11, fontWeight: '700' },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dato: { minWidth: '30%' },
  datoLabel: { fontSize: 10, color: colors.textMuted },
  datoValor: { fontSize: 13, fontWeight: '600', color: colors.text },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  totalLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  totalValor: { fontSize: 20, fontWeight: '800', color: colors.text },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  botonEliminar: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  botonEliminarText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  boton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  botonText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  deshabilitado: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  error: { fontSize: 13, color: colors.error },
});
