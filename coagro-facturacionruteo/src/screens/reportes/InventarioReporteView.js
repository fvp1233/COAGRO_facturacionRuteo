import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import LotesModal from '../../components/reportes/LotesModal';
import Pagination from '../../components/ui/Pagination';
import SearchBar from '../../components/ui/SearchBar';
import { getAvisoInventario, getInventario } from '../../repositories/articulos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { formatCantidad } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';
import { normalizar } from '../../utils/text';

// Campos de búsqueda.
const SEARCH_MODES = [
  { key: 'codigo', label: 'Código', icon: 'hash' },
  { key: 'descripcion', label: 'Descripción', icon: 'file-text' },
  { key: 'familia', label: 'Familia', icon: 'layers' },
  { key: 'clase', label: 'Clase', icon: 'tag' },
];

// Artículos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Card de un artículo del inventario: código, descripción, familia y clase a la izquierda;
// existencia (almacén) y unidades por empaque (detalle) a la derecha. Si tiene lotes en la bodega,
// el botón de lotes abre el popup. Línea izquierda verde con existencia y roja sin existencia.
function InventarioCard({ articulo, onVerLotes }) {
  const sinExistencia = articulo.almacen <= 0;
  return (
    <View style={[styles.card, sinExistencia ? styles.cardSinExistencia : styles.cardConExistencia]}>
      <View style={styles.cardBody}>
        <View style={styles.codeChip}>
          <Text style={styles.codeText}>{articulo.codigo}</Text>
        </View>
        <Text style={styles.nombre} numberOfLines={2}>{articulo.descripcion}</Text>
        <View style={styles.tags}>
          {articulo.familia ? (
            <View style={styles.tag}>
              <Feather name="layers" size={11} color={colors.textMuted} />
              <Text style={styles.tagText}>{articulo.familia}</Text>
            </View>
          ) : null}
          {articulo.clase ? (
            <View style={styles.tag}>
              <Feather name="tag" size={11} color={colors.textMuted} />
              <Text style={styles.tagText}>{articulo.clase}</Text>
            </View>
          ) : null}
          {articulo.lotes ? (
            <Pressable
              onPress={() => onVerLotes(articulo)}
              hitSlop={6}
              style={({ pressed }) => [styles.lotes, pressed && styles.pressed]}
            >
              <Feather name="layers" size={12} color={colors.primary} />
              <Text style={styles.lotesText}>
                {articulo.lotes} {articulo.lotes === 1 ? 'lote' : 'lotes'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.stockLabel}>ALMACÉN</Text>
        <Text style={[styles.stock, sinExistencia && styles.stockCero]}>{formatCantidad(articulo.almacen)}</Text>
        <Text style={styles.detalle}>Detalle {formatCantidad(articulo.detalle)}</Text>
      </View>
    </View>
  );
}

// Reporte de Inventario: existencias de la base local (se descargan en Datos > Cargar datos), en
// cards paginadas. El botón de lotes abre un popup con los lotes del artículo (lote, vencimiento,
// existencia).
export default function InventarioReporteView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [incluirSinExistencia, setIncluirSinExistencia] = useState(false);
  const [articulos, setArticulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ruta, setRuta] = useState(null);
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [query, setQuery] = useState('');
  // Artículo cuyos lotes se muestran en el popup; null = cerrado.
  const [lotesDe, setLotesDe] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  // Solo el grupo y la bodega del ERP de la ruta activa.
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    (async () => {
      const activa = await getRutaActiva();
      const [lista, mensaje] = await Promise.all([
        getInventario(activa, { incluirSinExistencia }),
        getAvisoInventario(activa),
      ]);
      return { activa, lista, mensaje };
    })()
      .then(({ activa, lista, mensaje }) => {
        if (cancelado) return;
        setRuta(activa);
        setArticulos(lista);
        setAviso(mensaje ?? '');
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer el inventario de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [incluirSinExistencia]);

  const filtrados = useMemo(() => {
    const q = normalizar(query);
    return q ? articulos.filter((a) => normalizar(a[searchMode]).includes(q)) : articulos;
  }, [articulos, query, searchMode]);

  // Al cambiar la búsqueda o el filtro de existencia se vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [query, searchMode, incluirSinExistencia]);

  // Solo se renderiza la página actual.
  const pagina = useMemo(
    () => filtrados.slice((page - 1) * pageSize, page * pageSize),
    [filtrados, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Inventario" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SearchBar
          modes={SEARCH_MODES}
          mode={searchMode}
          onModeChange={setSearchMode}
          query={query}
          onQueryChange={setQuery}
        />

        <View style={styles.optionsRow}>
          <Checkbox
            label="Incluir artículos sin existencia"
            checked={incluirSinExistencia}
            onChange={setIncluirSinExistencia}
          />
          <View style={styles.countChip}>
            <Feather name="package" size={12} color={colors.textMuted} />
            <Text style={styles.countText}>{filtrados.length} artículos</Text>
          </View>
        </View>

        {ruta ? (
          <Text style={styles.rutaInfo}>
            Ruta {ruta.label} · Bodega {ruta.bodegaErp ?? '—'}
          </Text>
        ) : null}

        {error ? <Text style={styles.warning}>{error}</Text> : null}
        {!error && aviso ? <Text style={styles.warning}>{aviso}</Text> : null}

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : (
          <>
            {filtrados.length ? (
              <View style={styles.lista}>
                {pagina.map((a) => (
                  <InventarioCard key={a.codigo} articulo={a} onVerLotes={setLotesDe} />
                ))}
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={filtrados.length}
                  onPageChange={irAPagina}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    irAPagina(1);
                  }}
                />
              </View>
            ) : (
              <View style={styles.empty}>
                <Feather name="package" size={32} color={colors.textDisabled} />
                <Text style={styles.emptyText}>No hay artículos para mostrar</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LotesModal articulo={lotesDe} ruta={ruta} onClose={() => setLotesDe(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  rutaInfo: {
    fontSize: 12,
    color: colors.textMuted,
  },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: {
    marginTop: spacing.lg,
  },
  lista: { gap: spacing.sm + 2 },
  card: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardConExistencia: { borderLeftColor: colors.success },
  cardSinExistencia: { borderLeftColor: colors.primary },
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
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs + 2, marginTop: 2 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  lotes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  lotesText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  pressed: { opacity: 0.6 },
  cardDerecha: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 72 },
  stockLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  stock: { fontSize: 20, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  stockCero: { color: colors.textDisabled },
  detalle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
