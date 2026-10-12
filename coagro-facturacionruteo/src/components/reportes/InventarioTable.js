import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import DataTable from '../ui/DataTable';
import { colors, radius, spacing } from '../../theme';

// Cantidades con hasta 2 decimales (sin ceros sobrantes): 12 -> "12", 2.5 -> "2.5".
const formatCantidad = (n) => Number(n ?? 0).toLocaleString('es', { maximumFractionDigits: 2 });

const Cantidad = ({ value }) => (
  <Text style={[styles.qty, value <= 0 && styles.qtyZero]}>{formatCantidad(value)}</Text>
);

const COLUMNS = [
  {
    key: 'codigo',
    title: 'COD.ART',
    width: 84,
    render: (a) => (
      <View style={styles.code}>
        <Text style={styles.codeText} numberOfLines={1}>{a.codigo}</Text>
      </View>
    ),
  },
  { key: 'descripcion', title: 'DESCRIPCIÓN', width: 240, grow: true },
  { key: 'familia', title: 'FAMILIA', width: 96, numberOfLines: 1 },
  { key: 'clase', title: 'CLASE', width: 96, numberOfLines: 1 },
  { key: 'almacen', title: 'ALMACÉN', width: 84, align: 'right', render: (a) => <Cantidad value={a.almacen} /> },
  { key: 'detalle', title: 'DETALLE', width: 84, align: 'right', render: (a) => <Cantidad value={a.detalle} /> },
];

// Tabla del reporte de Inventario.
// `articulos`: [{ codigo, descripcion, familia, clase, almacen, detalle }]
// (almacen = existencia; detalle = UND_EMP del artículo).
// primeraColumna: key de la columna que se muestra primero (la que se está buscando) y se resalta.
export default function InventarioTable({ articulos, primeraColumna = 'codigo', style }) {
  const columns = useMemo(() => {
    const primera = COLUMNS.find((c) => c.key === primeraColumna);
    return primera ? [primera, ...COLUMNS.filter((c) => c !== primera)] : COLUMNS;
  }, [primeraColumna]);

  return (
    <DataTable
      columns={columns}
      data={articulos}
      keyExtractor={(a) => a.codigo}
      highlightKey={primeraColumna}
      emptyText="No hay artículos para mostrar"
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  code: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF1F7',
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textLabel,
  },
  qty: {
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  qtyZero: {
    fontWeight: '400',
    color: colors.textSecondary,
  },
});
