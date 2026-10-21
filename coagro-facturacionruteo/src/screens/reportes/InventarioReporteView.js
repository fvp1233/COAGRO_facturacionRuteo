import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import InventarioTable from '../../components/reportes/InventarioTable';
import SearchBar from '../../components/ui/SearchBar';
import { getAvisoInventario, getInventario } from '../../repositories/articulos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { colors, radius, spacing } from '../../theme';
import { normalizar } from '../../utils/text';

// Campos de búsqueda; la columna elegida pasa a ser la primera de la tabla.
const SEARCH_MODES = [
  { key: 'codigo', label: 'Código', icon: 'hash' },
  { key: 'descripcion', label: 'Descripción', icon: 'file-text' },
  { key: 'familia', label: 'Familia', icon: 'layers' },
  { key: 'clase', label: 'Clase', icon: 'tag' },
];

// Reporte de Inventario: existencias de la base local (se descargan en Datos > Cargar datos).
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

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Inventario" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Feather name="package" size={12} color="#475569" />
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
          <InventarioTable articulos={filtrados} primeraColumna={searchMode} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F4F5FA',
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
    backgroundColor: '#E2E9F7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  rutaInfo: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  warning: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: {
    marginTop: spacing.lg,
  },
});
