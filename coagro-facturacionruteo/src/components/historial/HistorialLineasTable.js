import { StyleSheet, Text, View } from 'react-native';

import DataTable from '../ui/DataTable';
import { formatCantidad, formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const Monto = ({ value }) => <Text style={styles.monto}>{value == null ? '—' : formatMonto(value)}</Text>;

const COLUMNS = [
  {
    key: 'descripcion',
    title: 'Artículo',
    width: 190,
    grow: true,
    render: (l) => (
      <View>
        <Text style={styles.nombre} numberOfLines={2}>{l.descripcion || l.codigo}</Text>
        <View style={styles.meta}>
          {l.descripcion ? <Text style={styles.codigo}>{l.codigo}</Text> : null}
          {l.bonificacion ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>Bonificación</Text>
            </View>
          ) : null}
          {l.facturada ? (
            <View style={[styles.tag, styles.tagFacturada]}>
              <Text style={[styles.tagText, styles.tagTextFacturada]}>Facturada</Text>
            </View>
          ) : null}
        </View>
      </View>
    ),
  },
  {
    key: 'cantidad',
    title: 'Cant.',
    width: 60,
    align: 'right',
    render: (l) => (
      <View>
        <Text style={styles.monto}>{formatCantidad(l.cantidad)}</Text>
        {l.devuelta > 0 ? <Text style={styles.devuelta}>Dev. {formatCantidad(l.devuelta)}</Text> : null}
      </View>
    ),
  },
  { key: 'precio', title: 'Precio', width: 84, align: 'right', render: (l) => <Monto value={l.precio} /> },
  { key: 'porcDescuento', title: '% Desc.', width: 60, align: 'right', render: (l) => <Text style={styles.monto}>{formatPorcentaje(l.porcDescuento)}</Text> },
  { key: 'descuento', title: 'Desc.', width: 84, align: 'right', render: (l) => <Monto value={l.descuento} /> },
  { key: 'total', title: 'Total', width: 92, align: 'right', render: (l) => <Monto value={l.total} /> },
];

// Líneas de un pedido o una factura del historial (solo lectura). total ya trae el descuento
// restado; precio/total null se muestran como "—" (p. ej. líneas de pedido ya facturadas).
// lineas: [{ linea, codigo, descripcion, bonificacion, facturada?, cantidad, devuelta?, precio,
//            porcDescuento, descuento, total }]
export default function HistorialLineasTable({ lineas, style }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={lineas}
      keyExtractor={(l) => `${l.linea}|${l.codigo}`}
      emptyText="El documento no tiene líneas"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  nombre: { fontSize: 13, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2, flexWrap: 'wrap' },
  codigo: { fontSize: 11, color: colors.textMuted },
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: colors.highlight,
  },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.text },
  tagFacturada: { backgroundColor: colors.success },
  tagTextFacturada: { color: colors.onPrimary },
  monto: { fontSize: 13, color: colors.text, textAlign: 'right' },
  devuelta: { fontSize: 11, color: colors.warning, textAlign: 'right' },
});
