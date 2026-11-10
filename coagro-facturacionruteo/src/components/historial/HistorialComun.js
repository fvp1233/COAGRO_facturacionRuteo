import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Piezas compartidas por las vistas de historial (pedidos y facturas): mismo diseño y dinámica.

const ACCENT = colors.primary;

export const TABS_HISTORIAL = [
  { key: 'detalle', label: 'Detalle' },
  { key: 'montos', label: 'Montos' },
];

// Montos tal como llegan del servidor (no se recalculan).
const MONTOS = [
  { key: 'totalMercaderia', label: 'Total mercadería' },
  { key: 'descuentoVolumen', label: 'Descuento volumen' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'iva', label: 'IVA 13%' },
  { key: 'granTotal', label: 'Gran total', total: true },
];

export const formatDescarga = (iso) => new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

// 'YYYY-MM-DD HH:MM:SS' (hora local, sin zona) -> 'DD/MM/YY HH:MM', sin pasar por Date.
export const formatFechaHora = (v) => {
  const hora = /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0];
  return `${formatFechaDoc(v)}${hora ? ` ${hora}` : ''}`;
};

// Etiqueta de color (ANULADA, Pendiente, Facturado, Facturada...). tono: 'rojo' | 'ambar' | 'verde'.
export function Etiqueta({ texto, tono = 'rojo', style }) {
  return (
    <View style={[styles.etiqueta, styles[tono], style]}>
      <Text style={styles.etiquetaText}>{texto}</Text>
    </View>
  );
}

// Tarjeta del cliente con la fecha de la última descarga y el botón de actualizar (deshabilitado
// mientras hay una consulta en curso).
export function ClienteHistorialCard({ cliente, ruta, descargado, consultando, onActualizar }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoTexts}>
        <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
        <Text style={styles.clientMeta} numberOfLines={1}>
          {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
        </Text>
        {descargado ? (
          <Text style={styles.clientMeta} numberOfLines={1}>Actualizado: {formatDescarga(descargado)}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={onActualizar}
        disabled={consultando}
        hitSlop={8}
        style={({ pressed }) => [styles.refresh, (pressed || consultando) && styles.pressed]}
      >
        {consultando ? (
          <ActivityIndicator size="small" color={ACCENT} />
        ) : (
          <Feather name="refresh-cw" size={18} color={ACCENT} />
        )}
      </Pressable>
    </View>
  );
}

export function Dato({ label, value }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoLabel}>{label}</Text>
      <Text style={styles.datoValor} selectable>{value || '—'}</Text>
    </View>
  );
}

// Encabezado del documento seleccionado: tipo, etiquetas, número y datos (children).
export function EncabezadoDocumento({ tipo, numero, etiquetas, children }) {
  return (
    <View style={styles.detalleHeader}>
      <View style={styles.detalleTituloRow}>
        <Text style={styles.detalleTitulo}>{tipo}</Text>
        {etiquetas}
      </View>
      <Text style={styles.numero} selectable>{numero}</Text>
      <View style={styles.datos}>{children}</View>
    </View>
  );
}

export function TabsHistorial({ tab, onChange }) {
  return (
    <View style={styles.tabs}>
      {TABS_HISTORIAL.map((t) => (
        <Pressable key={t.key} onPress={() => onChange(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
          <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Tarjeta de montos. aviso: nodo opcional arriba de los montos (anulada, solo pendientes...).
// tachado: montos tachados (factura anulada).
export function MontosCard({ montos, aviso, tachado = false }) {
  return (
    <View style={styles.montos}>
      {aviso ? <View style={styles.montosAviso}>{aviso}</View> : null}
      {MONTOS.map((m) => (
        <View key={m.key} style={[styles.montoRow, m.total && styles.montoTotal]}>
          <Text style={[styles.montoLabel, m.total && styles.montoLabelTotal]}>{m.label}</Text>
          <Text style={[styles.montoValor, m.total && styles.montoValorTotal, tachado && styles.tachado]}>
            {formatMonto(montos[m.key])}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Estilos comunes de las vistas de historial.
export const historialStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  loading: { marginVertical: spacing.lg },
  aviso: { fontSize: 12, color: colors.warning },
  error: { fontSize: 12, color: colors.error },
  detalle: { gap: spacing.sm },
  avisoText: { fontSize: 13, color: colors.textMuted },
  avisoError: { fontSize: 13, color: colors.error },
});

const styles = StyleSheet.create({
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  infoTexts: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  refresh: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  etiqueta: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  rojo: { backgroundColor: colors.primary },
  ambar: { backgroundColor: colors.warning },
  verde: { backgroundColor: colors.success },
  etiquetaText: { fontSize: 10, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.5 },
  detalleHeader: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  detalleTituloRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  detalleTitulo: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  dato: { minWidth: 120 },
  datoLabel: { fontSize: 11, color: colors.textMuted },
  datoValor: { fontSize: 13, fontWeight: '600', color: colors.text },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: ACCENT },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.onPrimary },
  montos: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  montosAviso: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  montoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  montoTotal: { borderBottomWidth: 0 },
  montoLabel: { fontSize: 14, color: colors.textMuted },
  montoLabelTotal: { fontWeight: '700', color: colors.text },
  montoValor: { fontSize: 14, color: colors.text },
  montoValorTotal: { fontSize: 16, fontWeight: '800', color: ACCENT },
  tachado: { textDecorationLine: 'line-through', opacity: 0.6 },
});
