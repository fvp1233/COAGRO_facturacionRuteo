import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import Pagination from './Pagination';
import { colors, radius, spacing } from '../../theme';

const PAD = spacing.md;
const GAP = spacing.md;
const SELECTED = '#15803D';

// Tabla estándar de la app: TODAS las tablas deben usar este componente.
// - Paginación (10 registros por página al inicio; el usuario elige 10/25/50/100).
// - Deslizamiento horizontal cuando las columnas no caben en la pantalla.
// Las filas se dibujan sin virtualizar (máx. una página), así funciona dentro de un ScrollView.
//
// columns: [{ key, title, width, align?: 'left' | 'right' | 'center', grow?: bool,
//             numberOfLines?: number, render?: (item, { selected }) => node }]
//   `width` es el ancho mínimo; las columnas con `grow` se estiran si sobra pantalla.
// keyExtractor(item) -> clave única. onRowPress(item) / selectedKey para tablas seleccionables.
// highlightKey: columna cuyo encabezado se resalta (p. ej. la columna por la que se busca).
// Al cambiar `data` vuelve a la página 1 (o a la página de la fila seleccionada si está en ella).
export default function DataTable({
  columns,
  data,
  keyExtractor,
  onRowPress,
  selectedKey = null,
  highlightKey = null,
  emptyText = 'No hay registros para mostrar',
  initialPageSize = 10,
  pageSizes,
  style,
}) {
  const [ancho, setAncho] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const seleccionable = !!onRowPress;
  const minWidth =
    PAD * 2 + columns.reduce((sum, c) => sum + c.width, 0) + GAP * (columns.length - 1) + (seleccionable ? 4 : 0);
  const extra = Math.max(0, ancho - minWidth);
  const crecen = columns.filter((c) => c.grow).length;
  const anchoDe = (c) => c.width + (c.grow ? extra / crecen : 0);
  const desliza = ancho > 0 && ancho < minWidth;

  // Nuevos datos (filtros, recarga): página de la fila seleccionada, o la primera.
  useEffect(() => {
    const index = selectedKey == null ? -1 : data.findIndex((item) => keyExtractor(item) === selectedKey);
    setPage(index >= 0 ? Math.floor(index / pageSize) + 1 : 1);
    // selectedKey/pageSize no se incluyen: elegir una fila o cambiar el tamaño no debe mover la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const filas = useMemo(() => data.slice((page - 1) * pageSize, page * pageSize), [data, page, pageSize]);

  const cambiarPageSize = (size) => {
    setPageSize(size);
    setPage(1);
  };

  const alineacion = (c) => (c.align ? { textAlign: c.align } : null);

  return (
    <View style={[styles.root, style]}>
      <View style={styles.card} onLayout={(e) => setAncho(e.nativeEvent.layout.width)}>
        <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={desliza}>
          <View style={{ width: minWidth + extra }}>
            <View style={[styles.headerRow, seleccionable && styles.selectablePad]}>
              {columns.map((c) => (
                <Text
                  key={c.key}
                  style={[styles.headerText, { width: anchoDe(c) }, alineacion(c), c.key === highlightKey && styles.headerHighlight]}
                >
                  {c.title}
                </Text>
              ))}
            </View>

            {filas.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              filas.map((item, index) => {
                const key = keyExtractor(item);
                const selected = seleccionable && key === selectedKey;
                return (
                  <Pressable
                    key={key}
                    disabled={!seleccionable}
                    onPress={() => onRowPress?.(item)}
                    style={({ pressed }) => [
                      styles.row,
                      seleccionable && styles.rowSelectable,
                      index % 2 === 1 && styles.rowAlt,
                      index === filas.length - 1 && styles.rowLast,
                      selected && styles.rowSelected,
                      pressed && !selected && styles.rowPressed,
                    ]}
                  >
                    {columns.map((c) => (
                      <View key={c.key} style={[styles.cell, { width: anchoDe(c) }]}>
                        {c.render ? (
                          c.render(item, { selected })
                        ) : (
                          <Text style={[styles.cellText, alineacion(c)]} numberOfLines={c.numberOfLines ?? 2}>
                            {item[c.key]}
                          </Text>
                        )}
                      </View>
                    ))}
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>

        {desliza ? (
          <View style={styles.hint}>
            <Feather name="chevrons-right" size={12} color={colors.textSecondary} />
            <Text style={styles.hintText}>Desliza la tabla para ver todas las columnas</Text>
          </View>
        ) : null}
      </View>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={data.length}
        pageSizes={pageSizes}
        onPageChange={setPage}
        onPageSizeChange={cambiarPageSize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF1FA',
    paddingHorizontal: PAD,
    paddingVertical: spacing.sm + 4,
    gap: GAP,
  },
  selectablePad: {
    paddingLeft: PAD + 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  headerHighlight: {
    color: SELECTED,
  },
  empty: {
    padding: spacing.lg,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: PAD,
    paddingVertical: spacing.sm + 2,
    gap: GAP,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowSelectable: {
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowAlt: {
    backgroundColor: '#F8FAFD',
  },
  rowSelected: {
    backgroundColor: '#DCF5E3',
    borderLeftColor: SELECTED,
  },
  rowPressed: {
    backgroundColor: '#F1F5F9',
  },
  cell: {
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 14,
    lineHeight: 19,
    color: colors.textPrimary,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: '#F8FAFD',
  },
  hintText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
});
