import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CenteredHeader from '../ui/CenteredHeader';
import SelectField from '../ui/SelectField';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;

// Descuentos 1 y 2 del encabezado: aún no hay de dónde salen (0).
const DESCUENTO1 = 0;
const DESCUENTO2 = 0;
// Días que se ofrecen para la entrega, desde hoy.
const DIAS_ENTREGA = 30;

const fecha = (d) => d.toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
const hora = (d) => d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

// Opciones de entrega: "Hoy - 22/10/2026", "Mañana - 23/10/2026", "vie 24/10/2026"...
function opcionesEntrega(desde) {
  return Array.from({ length: DIAS_ENTREGA }, (_, i) => {
    const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i);
    const dia = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es', { weekday: 'short' });
    return { fecha: d, texto: `${dia} - ${fecha(d)}` };
  });
}

function Dato({ label, value, destacado = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.readOnly, destacado && styles.destacado]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Resumen del pedido antes de guardarlo (solo lectura). Suma las líneas agregadas:
// total bruto = Σ subtotal; descuento = Σ descuento de línea; IVA = Σ IMPUESTO1; OI (otros
// impuestos) = Σ IMPUESTO2. Total neto = bruto − descuentos + IVA + OI.
// La fecha de entrega la elige el vendedor (desde hoy); por defecto es hoy.
// lineas: [{ subtotal, descuento, iva, oi, moneda }]. formatMonto(n, moneda) da el texto del monto.
// onGuardar(entrega: Date) -> Promise: guarda el pedido; mientras tanto el botón queda deshabilitado.
export default function PedidoResumenModal({ visible, cliente, encabezado, lineas, formatMonto, onGuardar, onClose }) {
  const insets = useSafeAreaInsets();
  const [guardando, setGuardando] = useState(false);
  // Fecha y hora en que se abre el resumen.
  const [ahora, setAhora] = useState(() => new Date());
  const [entrega, setEntrega] = useState(null);
  useEffect(() => {
    if (visible) setAhora(new Date());
  }, [visible]);

  const opciones = useMemo(() => opcionesEntrega(ahora), [ahora]);
  const entregaActual = opciones.find((o) => entrega && o.fecha.getTime() === entrega.getTime()) ?? opciones[0];

  const moneda = lineas[0]?.moneda;
  const suma = (campo) => lineas.reduce((s, l) => s + l[campo], 0);
  const bruto = suma('subtotal');
  const descuento = suma('descuento');
  const iva = suma('iva');
  const oi = suma('oi');
  const neto = bruto - descuento - DESCUENTO1 - DESCUENTO2 + iva + oi;
  const m = (n) => formatMonto(n, moneda);

  const confirmarGuardar = () => {
    if (guardando) return;
    Alert.alert('Guardar pedido', `¿Guardar el pedido por ${m(neto)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Guardar',
        onPress: async () => {
          setGuardando(true);
          try {
            await onGuardar?.(entregaActual.fecha);
          } finally {
            setGuardando(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CenteredHeader title="Resumen del pedido" onBack={onClose} />

        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.info} numberOfLines={1}>
            {cliente.codigo} · {cliente.nombre}
            {encabezado?.nivelPrecio ? ` · ${encabezado.nivelPrecio}` : ''} · {lineas.length}{' '}
            {lineas.length === 1 ? 'artículo' : 'artículos'}
          </Text>

          <View style={styles.card}>
            <View style={styles.grid}>
              <Dato label="Fecha" value={fecha(ahora)} />
              <Dato label="Hora" value={hora(ahora)} />
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
              <Dato label="Total bruto" value={m(bruto)} />
              <Dato label="Descuento" value={m(descuento)} />
              <Dato label="Descuento 1" value={m(DESCUENTO1)} />
              <Dato label="Descuento 2" value={m(DESCUENTO2)} />
              <Dato label="IVA" value={m(iva)} />
              <Dato label="OI" value={m(oi)} />
              <Dato label="Total neto" value={m(neto)} destacado />
            </View>
          </View>
        </ScrollView>

        <View style={styles.bar}>
          <Pressable
            onPress={confirmarGuardar}
            disabled={guardando}
            style={({ pressed }) => [styles.action, (pressed || guardando) && styles.pressed]}
          >
            {guardando ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Feather name="save" size={20} color={colors.onPrimary} />
            )}
            <Text style={styles.actionText}>{guardando ? 'Guardando...' : 'Guardar pedido'}</Text>
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
