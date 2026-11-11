import { StyleSheet, Text, View } from 'react-native';

import { formatCantidad, formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const monto = (v) => (v == null ? '—' : formatMonto(v));

// Una línea del documento en formato card: artículo arriba; cantidad × precio, descuento y total abajo.
function LineaCard({ l }) {
  return (
    <View style={styles.card}>
      <Text style={styles.nombre} numberOfLines={2}>{l.descripcion || l.codigo}</Text>
      <View style={styles.meta}>
        {l.descripcion ? <Text style={styles.codigo}>{l.codigo}</Text> : null}
        {l.bonificacion ? (
          <View style={[styles.tag, styles.tagBonif]}>
            <Text style={[styles.tagText, styles.tagTextBonif]}>BONIFICACIÓN</Text>
          </View>
        ) : null}
        {l.facturada ? (
          <View style={[styles.tag, styles.tagFacturada]}>
            <Text style={[styles.tagText, styles.tagTextFacturada]}>FACTURADA</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.numeros}>
        <View style={styles.calculo}>
          <Text style={styles.cantidad}>
            {formatCantidad(l.cantidad)} × {monto(l.precio)}
          </Text>
          {l.descuento ? (
            <Text style={styles.descuento}>
              Desc. {formatPorcentaje(l.porcDescuento)} · -{monto(l.descuento)}
            </Text>
          ) : null}
          {l.devuelta > 0 ? <Text style={styles.devuelta}>Devuelta: {formatCantidad(l.devuelta)}</Text> : null}
        </View>
        <Text style={styles.total}>{monto(l.total)}</Text>
      </View>
    </View>
  );
}

// Líneas de un pedido o una factura del historial (solo lectura) en cards. total ya trae el
// descuento restado; precio/total null se muestran como "—" (p. ej. líneas de pedido ya facturadas).
// lineas: [{ linea, codigo, descripcion, bonificacion, facturada?, cantidad, devuelta?, precio,
//            porcDescuento, descuento, total }]
export default function HistorialLineasList({ lineas }) {
  if (!lineas.length) {
    return <Text style={styles.empty}>El documento no tiene líneas</Text>;
  }
  return (
    <View style={styles.list}>
      {lineas.map((l) => (
        <LineaCard key={`${l.linea}|${l.codigo}`} l={l} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    gap: 4,
  },
  nombre: { fontSize: 14, fontWeight: '600', color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexWrap: 'wrap' },
  codigo: { fontSize: 11, color: colors.textMuted },
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  tagText: { fontSize: 10, fontWeight: '700' },
  tagBonif: { backgroundColor: '#FFF1C7' },
  tagTextBonif: { color: '#8A6500' },
  tagFacturada: { backgroundColor: '#E3F2F1' },
  tagTextFacturada: { color: colors.success },
  numeros: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 4,
  },
  calculo: { flex: 1, gap: 1 },
  cantidad: { fontSize: 13, color: colors.textMuted },
  descuento: { fontSize: 12, color: colors.success },
  devuelta: { fontSize: 12, color: '#B85F00' },
  total: { fontSize: 15, fontWeight: '800', color: colors.text },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
});
