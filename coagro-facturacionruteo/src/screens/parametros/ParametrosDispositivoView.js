import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import FirmaEquipo from '../../components/ui/FirmaEquipo';
import { readConfig } from '../../services/localConfig';
import { getRutaActiva, getRutasHandheld, setRutaActiva } from '../../repositories/rutaActiva';
import { colors, radius, spacing } from '../../theme';
import appConfig from '../../../app.json';

const pad = (n) => String(n).padStart(2, '0');
const formatFecha = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const formatHora = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Parámetros del dispositivo: ruta, fecha/hora del momento en que se abrió la pantalla, teléfono,
// operador y versión de la app. Teléfono y operador aún no tienen endpoint en el servidor.
export default function ParametrosDispositivoView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [rutas, setRutas] = useState([]);
  const [rutaLabel, setRutaLabel] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Se fija al abrir; no se actualiza mientras la pantalla está abierta.
  const [abierto] = useState(() => new Date());
  const [handheld, setHandheld] = useState(null);

  // Handheld configurada en este equipo (JSON de la pantalla de Conexión).
  useEffect(() => {
    let cancelado = false;
    readConfig().then((config) => {
      if (!cancelado) setHandheld(config?.connection?.handheld ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Rutas de la handheld; el código elegido es la ruta activa (con la que se vende).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const lista = await getRutasHandheld();
      return { lista, activa: await getRutaActiva(lista) };
    })()
      .then(({ lista, activa }) => {
        if (cancelado) return;
        setRutas(lista);
        setRutaLabel(activa?.label ?? '');
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const cambiarRuta = (label) => {
    const ruta = rutas.find((r) => r.label === label);
    if (!ruta) return;
    setRutaLabel(label);
    setRutaActiva(ruta.codigo).catch(() => setError('No se pudo guardar la ruta activa.'));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Parámetros del Dispositivo" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {cargando ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : (
          <SelectField
            label="Código"
            value={rutaLabel || (rutas.length ? 'Elegir ruta' : 'Sin rutas')}
            options={rutas.map((r) => r.label)}
            onChange={cambiarRuta}
          />
        )}

        {error ? <Text style={styles.warning}>{error}</Text> : null}
        {!cargando && !error && rutas.length === 0 ? (
          <Text style={styles.warning}>No hay rutas en el equipo. Descarga los datos en Datos &gt; Cargar datos.</Text>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Dispositivo</Text>
          <View style={styles.row}>
            <Field label="Fecha" value={formatFecha(abierto)} style={styles.half} />
            <Field label="Hora" value={formatHora(abierto)} style={styles.half} />
          </View>
          <View style={styles.row}>
            <Field label="Teléfono" value={null} style={styles.half} />
            <Field label="Operador" value={null} style={styles.half} />
          </View>
          <Field label="Versión de módulo" value={appConfig.expo.version} />
          <Field label="Handheld" value={handheld} />
          <FirmaEquipo />
          <Text style={styles.hint}>
            La handheld solo funciona en el equipo con esta firma. Si hay que cambiar de equipo, comparte la firma con soporte.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, style }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.value} numberOfLines={1}>{value || '—'}</Text>
      </View>
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
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  value: { fontSize: 14, color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted },
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
});
