import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { syncClientes } from '../services/syncClientes';
import { syncArticulos } from '../services/syncArticulos';
import { contarClientes, getUltimaSincronizacion } from '../repositories/clientes';
import { contarArticulos } from '../repositories/articulos';
import { colors, radius, spacing } from '../theme';

const ACCENT = '#0EA5E9';

const ACTIONS = [
  { id: 'cargar', title: 'Cargar datos', subtitle: 'Descargar datos desde el servidor', icon: 'download-cloud' },
  { id: 'enviar', title: 'Enviar Datos', subtitle: 'Enviar al servidor lo registrado', icon: 'upload-cloud' },
  { id: 'archivos', title: 'Actualizar Archivos', subtitle: 'Actualizar catálogos y archivos', icon: 'refresh-cw' },
];

function formatFecha(iso) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nunca';
  return d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

// Sincronización de datos. "Cargar datos" descarga las tablas del sistema en línea a la base local
// (clientes y artículos; aquí se irán sumando más tablas). Los otros botones aún no funcionan.
export default function DatosScreen({ module, onBack }) {
  const insets = useSafeAreaInsets();
  const [ultima, setUltima] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalArticulos, setTotalArticulos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState('');

  const refrescar = useCallback(async () => {
    try {
      setUltima(await getUltimaSincronizacion());
      setTotal(await contarClientes());
      setTotalArticulos(await contarArticulos());
    } catch {
      // si la base falla, el error se mostrará al cargar datos
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const cargarDatos = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setResumen(null);
    try {
      // Cuando haya más tablas, se llaman aquí una tras otra.
      const clientes = await syncClientes();
      const articulos = await syncArticulos();
      setResumen({ ...clientes, articulos: articulos.articulos, omitidos: clientes.omitidos + articulos.omitidos });
    } catch (e) {
      setError(e?.message || 'No se pudo cargar los datos.');
    } finally {
      // Aunque falle una tabla, las que sí se guardaron se reflejan en los contadores.
      await refrescar();
      setLoading(false);
    }
  };

  const handlePress = (action) => {
    if (action.id === 'cargar') {
      cargarDatos();
    } else {
      Alert.alert(action.title, 'Próximamente.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
          <Feather name="arrow-left" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{module?.title ?? 'Datos'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.statusCard}>
          <Text style={styles.line}>
            Última carga: <Text style={styles.bold}>{formatFecha(ultima)}</Text>
          </Text>
          <Text style={styles.line}>
            Clientes guardados: <Text style={styles.bold}>{total}</Text>
          </Text>
          <Text style={styles.line}>
            Artículos guardados: <Text style={styles.bold}>{totalArticulos}</Text>
          </Text>
        </View>

        {ACTIONS.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => handlePress(action)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Feather name={action.icon} size={24} color="#FFFFFF" />
            </View>
            <View style={styles.texts}>
              <Text style={styles.buttonTitle}>{action.title}</Text>
              <Text style={styles.buttonSubtitle}>{action.subtitle}</Text>
            </View>
            {loading && action.id === 'cargar' ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <Feather name="chevron-right" size={20} color={colors.placeholder} />
            )}
          </Pressable>
        ))}

        {resumen ? (
          <View style={[styles.message, styles.ok]}>
            <Text style={styles.okText}>
              Carga completa: {resumen.clientes} clientes, {resumen.rutas} rutas, {resumen.asignaciones} asignaciones, {resumen.articulos} artículos.
              {resumen.omitidos > 0 ? ` (${resumen.omitidos} filas omitidas por datos incompletos)` : ''}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.message, styles.fail]}>
            <Text style={styles.failText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F6F8F6',
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#C7E0F7',
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  line: { fontSize: 13, color: colors.textSecondary },
  bold: { fontWeight: '700', color: colors.textPrimary },
  message: { borderRadius: radius.md, padding: spacing.md },
  ok: { backgroundColor: '#DCF5E3' },
  okText: { fontSize: 13, color: '#14532D' },
  fail: { backgroundColor: '#FEE2E2' },
  failText: { fontSize: 13, color: '#991B1B' },
  buttonSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
