import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CenteredHeader from '../ui/CenteredHeader';
import SelectField from '../ui/SelectField';
import { opcionesEntrega } from './PedidoResumenModal';
import { formatFechaDoc, formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;

const fecha = (d) => d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });

function Dato({ label, value, destacado = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.readOnly, destacado && styles.destacado]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Aprobación de una cotización (solo lectura de sus montos). Al aprobarla pasa a pedido con la
// fecha de hoy; la entrega se vuelve a elegir (la original puede haber quedado en el pasado).
// cotizacion: fila de getCotizacionesCliente. onAprobar(entrega: Date) -> Promise.
export default function AprobarCotizacionModal({ visible, cliente, cotizacion, onAprobar, onClose }) {
  const insets = useSafeAreaInsets();
  const [aprobando, setAprobando] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const [entrega, setEntrega] = useState(null);
  useEffect(() => {
    if (visible) {
      setAhora(new Date());
      setEntrega(null);
    }
  }, [visible]);

  const opciones = useMemo(() => opcionesEntrega(ahora), [ahora]);
  const entregaActual = opciones.find((o) => entrega && o.fecha.getTime() === entrega.getTime()) ?? opciones[0];

  if (!cotizacion) return null;
  const m = (n) => formatMontoMoneda(n, cotizacion.moneda);

  const confirmar = () => {
    if (aprobando) return;
    Alert.alert(
      'Aprobar cotización',
      `¿Convertir la cotización ${cotizacion.numero} en pedido por ${m(cotizacion.total)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aprobar',
          onPress: async () => {
            setAprobando(true);
            try {
              await onAprobar?.(entregaActual.fecha);
            } finally {
              setAprobando(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CenteredHeader title={`Cotización ${cotizacion.numero}`} onBack={onClose} />

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.info} numberOfLines={1}>
            {cliente.codigo} · {cliente.nombre} · {cotizacion.articulos}{' '}
            {cotizacion.articulos === 1 ? 'artículo' : 'artículos'}
          </Text>

          <View style={styles.card}>
            <View style={styles.grid}>
              <Dato label="Cotizada el" value={formatFechaDoc(cotizacion.fecha)} />
              <Dato label="Fecha del pedido" value={fecha(ahora)} />
            </View>
            <SelectField
              label="Entrega"
              value={entregaActual.texto}
              options={opciones.map((o) => o.texto)}
              onChange={(texto) => setEntrega(opciones.find((o) => o.texto === texto)?.fecha ?? null)}
            />
          </View>

          <View style={styles.card}>
            <View style={styles.grid}>
              <Dato label="Total bruto" value={m(cotizacion.sinIva + cotizacion.descuento)} />
              <Dato label="Descuento" value={m(cotizacion.descuento)} />
              <Dato label="IVA" value={m(cotizacion.iva)} />
              <Dato label="OI" value={m(cotizacion.oi)} />
              <Dato label="Total neto" value={m(cotizacion.total)} destacado />
            </View>
          </View>
        </ScrollView>

        <View style={styles.bar}>
          <Pressable
            onPress={confirmar}
            disabled={aprobando}
            style={({ pressed }) => [styles.action, (pressed || aprobando) && styles.pressed]}
          >
            {aprobando ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Feather name="check-circle" size={20} color={colors.onPrimary} />
            )}
            <Text style={styles.actionText}>{aprobando ? 'Aprobando...' : 'Aprobar como pedido'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  info: { fontSize: 12, color: colors.textMuted },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm + 4 },
  field: { width: '48%', gap: 4 },
  label: { fontSize: 12, color: colors.textMuted },
  readOnly: {
    height: 42,
    lineHeight: 42,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  destacado: { backgroundColor: colors.primarySoft, color: ACCENT },
  bar: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
