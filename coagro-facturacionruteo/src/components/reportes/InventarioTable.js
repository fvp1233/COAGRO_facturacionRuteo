import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import DataTable from '../ui/DataTable';
import { formatCantidad } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

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
    backgroundColor: colors.border,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  qty: {
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  qtyZero: {
    fontWeight: '400',
    color: colors.textMuted,
  },
});
