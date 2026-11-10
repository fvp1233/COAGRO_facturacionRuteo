import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

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

// Botón "Ver lotes" del artículo; sin lotes en la bodega de la ruta se muestra un guion.
function BotonLotes({ articulo, onPress }) {
  if (!articulo.lotes) return <Text style={styles.sinLotes}>—</Text>;
  return (
    <Pressable
      onPress={() => onPress?.(articulo)}
      hitSlop={6}
      style={({ pressed }) => [styles.lotes, pressed && styles.pressed]}
    >
      <Feather name="layers" size={13} color={colors.primary} />
      <Text style={styles.lotesText}>{articulo.lotes}</Text>
    </Pressable>
  );
}

// Tabla del reporte de Inventario.
// `articulos`: [{ codigo, descripcion, familia, clase, almacen, detalle, lotes }]
// (almacen = existencia; detalle = UND_EMP del artículo; lotes = cantidad de lotes en la bodega).
// primeraColumna: key de la columna que se muestra primero (la que se está buscando) y se resalta.
// onVerLotes(articulo): al tocar el botón de lotes del artículo.
export default function InventarioTable({ articulos, primeraColumna = 'codigo', onVerLotes, style }) {
  const columns = useMemo(() => {
    const primera = COLUMNS.find((c) => c.key === primeraColumna);
    const ordenadas = primera ? [primera, ...COLUMNS.filter((c) => c !== primera)] : COLUMNS;
    return [
      ...ordenadas,
      {
        key: 'lotes',
        title: 'LOTES',
        width: 64,
        align: 'center',
        render: (a) => <BotonLotes articulo={a} onPress={onVerLotes} />,
      },
    ];
  }, [primeraColumna, onVerLotes]);

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
  lotes: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  lotesText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  sinLotes: {
    textAlign: 'center',
    color: colors.textDisabled,
  },
  pressed: {
    opacity: 0.6,
  },
});
