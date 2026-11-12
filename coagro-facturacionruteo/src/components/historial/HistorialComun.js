import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// Llaves de pedidos y facturas del historial (compañía + número).
export const clavePedido = (p) => `${p.compania}|${p.numero}`;
export const claveFactura = (f) => `${f.compania}|${f.numero}`;

// Etiqueta de color (ANULADA, Pendiente, Facturado, Facturada...). tono: 'rojo' | 'ambar' | 'verde'.
export function Etiqueta({ texto, tono = 'rojo', style }) {
  return (
    <View style={[styles.etiqueta, styles[tono], style]}>
      <Text style={styles.etiquetaText}>{texto}</Text>
    </View>
  );
}

// Estado del pedido (EST_PED): 'F' facturado; cualquier otro, pendiente.
export function EtiquetaEstadoPedido({ estado, style }) {
  return estado === 'F' ? (
    <Etiqueta texto="Facturado" tono="verde" style={style} />
  ) : (
    <Etiqueta texto="Pendiente" tono="ambar" style={style} />
  );
}

// Distintivo rojo de factura anulada.
export function BadgeAnulada({ style }) {
  return <Etiqueta texto="ANULADA" tono="rojo" style={style} />;
}

// Tarjeta del cliente con la fecha de la última descarga (Datos > Cargar datos).
export function ClienteHistorialCard({ cliente, ruta, descargado }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
      <Text style={styles.clientMeta} numberOfLines={1}>
        {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
      </Text>
      {descargado ? (
        <Text style={styles.clientMeta} numberOfLines={1}>Actualizado: {formatDescarga(descargado)}</Text>
      ) : null}
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

// Popup (hoja desde abajo) con el detalle de un documento del historial. Se cierra con la X, tocando
// fuera o con el botón atrás. tipo: 'PEDIDO' | 'FACTURA'; etiquetas: nodo junto al tipo (estado,
// ANULADA...); children: contenido desplazable (total, datos, pestañas...).
export function DetalleSheet({ visible, tipo, numero, etiquetas, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitulo}>
              <View style={styles.sheetTipoRow}>
                <Text style={historialStyles.seccionLabel}>{tipo}</Text>
                {etiquetas}
              </View>
              <Text style={styles.sheetNumero} selectable>{numero}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
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
  seccionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  // Lista de cards de documentos y card compacta (línea izquierda de color = estado).
  lista: { gap: spacing.sm + 2 },
  contador: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm + 4,
    paddingRight: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTexts: { flex: 1 },
  cardNumero: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 12, color: colors.textMuted },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  cardTotal: { fontSize: 16, fontWeight: '800', color: colors.text },
  cardEstado: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  pressed: { opacity: 0.7 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  printButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  printText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  // Contenido del popup de detalle.
  sheetTotal: { alignItems: 'center' },
  sheetTotalValor: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  datos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md + 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 4,
    paddingBottom: spacing.sm,
  },
  sheetTitulo: { flex: 1 },
  sheetTipoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetNumero: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  sheetContent: { paddingHorizontal: spacing.md + 4, paddingTop: spacing.xs, gap: spacing.md },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
