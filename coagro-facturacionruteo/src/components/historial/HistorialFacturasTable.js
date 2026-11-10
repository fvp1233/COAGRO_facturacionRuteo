import { StyleSheet, Text, View } from 'react-native';

import DataTable from '../ui/DataTable';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Distintivo rojo de factura anulada (también lo usa el detalle).
export function BadgeAnulada({ style }) {
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>ANULADA</Text>
    </View>
  );
}

// Las anuladas se ven atenuadas y con el total tachado.
const COLUMNS = [
  {
    key: 'numero',
    title: 'Factura',
    width: 170,
    grow: true,
    render: (f) => (
      <View style={f.anulada && styles.atenuada}>
        <Text style={styles.texto} numberOfLines={2}>{f.numero}</Text>
        {f.anulada ? <BadgeAnulada style={styles.badgeFila} /> : null}
      </View>
    ),
  },
  {
    key: 'pedido',
    title: 'Pedido',
    width: 90,
    render: (f) => <Text style={[styles.texto, f.anulada && styles.atenuada]} numberOfLines={1}>{f.pedido || '—'}</Text>,
  },
  {
    key: 'fecha',
    title: 'Fecha',
    width: 72,
    render: (f) => <Text style={[styles.texto, f.anulada && styles.atenuada]}>{formatFechaDoc(f.fecha)}</Text>,
  },
  {
    key: 'total',
    title: 'Total',
    width: 96,
    align: 'right',
    render: (f) => (
      <Text style={[styles.texto, styles.derecha, f.anulada && [styles.atenuada, styles.tachado]]}>
        {formatMonto(f.total)}
      </Text>
    ),
  },
];

export const claveFactura = (f) => `${f.compania}|${f.numero}`;

// Tabla del historial de facturas de un cliente (seleccionable).
// facturas: [{ compania, numero, pedido, fecha, total (MON_FAC), anulada }]
export default function HistorialFacturasTable({ facturas, selectedKey, onSelect, highlightKey, emptyText, style }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={facturas}
      keyExtractor={claveFactura}
      onRowPress={onSelect}
      selectedKey={selectedKey}
      highlightKey={highlightKey}
      emptyText={emptyText}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  texto: { fontSize: 13, color: colors.text },
  derecha: { textAlign: 'right' },
  atenuada: { opacity: 0.5 },
  tachado: { textDecorationLine: 'line-through' },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  badgeFila: { marginTop: 2 },
  badgeText: { fontSize: 10, fontWeight: '800', color: colors.onPrimary, letterSpacing: 0.5 },
});
