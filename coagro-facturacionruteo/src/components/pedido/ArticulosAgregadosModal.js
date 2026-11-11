import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CenteredHeader from '../ui/CenteredHeader';
import Pagination from '../ui/Pagination';
import { TIPOS_PEDIDO } from '../../repositories/pedidos';
import { formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Líneas por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Card de una línea agregada: código, descripción, cantidad × precio, descuento, total y eliminar.
function LineaCard({ linea, formatMonto, onEliminar }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <View style={styles.codeChip}>
          <Text style={styles.codeText}>{linea.codigo}</Text>
        </View>
        <Text style={styles.nombre} numberOfLines={2}>{linea.descripcion}</Text>
        <View style={styles.meta}>
          <Feather name="shopping-cart" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {linea.cantidadTexto} × {formatMonto(linea.precio, linea.moneda)} ={' '}
            <Text style={styles.total}>{formatMonto(linea.total, linea.moneda)}</Text>
          </Text>
        </View>
        {linea.porcDescuento ? (
          <Text style={styles.descuento}>
            Desc. {formatPorcentaje(linea.porcDescuento)} · -{formatMonto(linea.descuento, linea.moneda)}
          </Text>
        ) : null}
      </View>
      {/* Columna derecha solo con el botón de eliminar, centrado. */}
      <View style={styles.cardDerecha}>
        <Pressable
          onPress={() => onEliminar(linea.codigo)}
          hitSlop={10}
          style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        >
          <Feather name="trash-2" size={18} color={colors.error} />
        </Pressable>
      </View>
    </View>
  );
}

// Pantalla con los artículos agregados al pedido (lupa en Artículos del pedido), en cards paginadas.
// lineas: [{ codigo, descripcion, cantidadTexto (ej. "1 BARRIL + 100 LT"), precio, porcDescuento,
// descuento, total, moneda }]. formatMonto(n, moneda) da el texto del monto.
// onEliminar(codigo) quita la línea; total = suma de las líneas. tipo: TIPOS_PEDIDO (textos).
export default function ArticulosAgregadosModal({
  visible,
  lineas,
  total,
  tipo = TIPOS_PEDIDO.pedido,
  formatMonto,
  onEliminar,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const moneda = lineas[0]?.moneda;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  // Si se elimina la última línea de la última página, se vuelve a la página anterior.
  const totalPages = Math.max(1, Math.ceil(lineas.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagina = useMemo(() => lineas.slice((page - 1) * pageSize, page * pageSize), [lineas, page, pageSize]);

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CenteredHeader title="Artículos agregados" onBack={onClose} />
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content}>
          {lineas.length ? (
            <>
              {pagina.map((l) => (
                <LineaCard key={l.codigo} linea={l} formatMonto={formatMonto} onEliminar={onEliminar} />
              ))}
              <Pagination
                page={Math.min(page, totalPages)}
                pageSize={pageSize}
                total={lineas.length}
                onPageChange={irAPagina}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  irAPagina(1);
                }}
              />
            </>
          ) : (
            <View style={styles.empty}>
              <Feather name="shopping-cart" size={32} color={colors.textDisabled} />
              <Text style={styles.emptyText}>Aún no has agregado artículos. Toca un artículo para agregarlo.</Text>
            </View>
          )}
        </ScrollView>
        <View style={styles.bar}>
          <Text style={styles.barLabel}>
            Total {tipo.del} · {lineas.length} {lineas.length === 1 ? 'artículo' : 'artículos'}
          </Text>
          <Text style={styles.barTotal}>{formatMonto(total, moneda)}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.sm + 2 },
  card: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
    padding: spacing.sm + 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardBody: { flex: 1, gap: 4 },
  codeChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  nombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1, fontSize: 13, color: colors.textMuted },
  descuento: { fontSize: 12, color: colors.success },
  cardDerecha: {
    justifyContent: 'center',
    paddingLeft: spacing.sm + 4,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  delete: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  total: { fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barLabel: { fontSize: 13, color: colors.textMuted },
  barTotal: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
