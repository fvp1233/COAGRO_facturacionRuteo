import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import { getRutas } from '../../repositories/clientes';
import { getConsecutivosRuta } from '../../repositories/consecutivos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { colors, radius, spacing } from '../../theme';

// Campos que se muestran, en pares (dos por fila).
const CAMPOS = [
  [
    { key: 'pedido', label: 'Pedido' },
    { key: 'pedidoDescuento', label: 'Pedido Desc.' },
  ],
  [
    { key: 'recibo', label: 'Recibo' },
    { key: 'inventario', label: 'Inventario' },
  ],
  [
    { key: 'devolucion', label: 'Devolución' },
    { key: 'factura', label: 'Factura' },
  ],
  [
    { key: 'notaCredito', label: 'Nota de Crédito' },
    { key: 'garantia', label: 'Dep. Garantía' },
  ],
];

// Parámetros del sistema: consecutivos de documentos de la ruta elegida (RUTA_CONSECUT_RT local).
export default function ParametrosSistemaView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [rutas, setRutas] = useState([]);
  const [rutaLabel, setRutaLabel] = useState('');
  const [consecutivos, setConsecutivos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const rutaCodigo = rutas.find((r) => r.label === rutaLabel)?.codigo ?? null;

  // Rutas disponibles en el equipo; empieza en la ruta activa.
  useEffect(() => {
    let cancelado = false;
    Promise.all([getRutas(), getRutaActiva()])
      .then(([lista, activa]) => {
        if (cancelado) return;
        setRutas(lista);
        setRutaLabel((lista.find((r) => r.codigo === activa?.codigo) ?? lista[0])?.label ?? '');
        if (lista.length === 0) setCargando(false);
      })
      .catch(() => {
        if (!cancelado) {
          setError('No se pudo leer la base local.');
          setCargando(false);
        }
      });
    return () => {
      cancelado = true;
    };
  }, []);

  // Consecutivos de la ruta elegida.
  useEffect(() => {
    if (!rutaCodigo) return undefined;
    let cancelado = false;
    setCargando(true);
    setError('');
    getConsecutivosRuta(rutaCodigo)
      .then((datos) => {
        if (!cancelado) setConsecutivos(datos);
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer los consecutivos de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [rutaCodigo]);

  const renderDatos = () => {
    if (cargando) return <ActivityIndicator color={colors.primary} style={styles.loading} />;
    if (!consecutivos) {
      return (
        <Text style={styles.warning}>
          {rutas.length === 0
            ? 'No hay rutas en el equipo. Descarga los datos en Datos > Cargar datos.'
            : 'Esta ruta no tiene consecutivos. Descárgalos en Datos > Cargar datos.'}
        </Text>
      );
    }
    return (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Consecutivos de documentos</Text>
        {CAMPOS.map((par) => (
          <View key={par[0].key} style={styles.row}>
            {par.map((campo) => (
              <Field key={campo.key} label={campo.label} value={consecutivos[campo.key]} style={styles.half} />
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Parámetros del Sistema" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <SelectField
          label="Ruta"
          value={rutaLabel || 'Sin rutas'}
          options={rutas.map((r) => r.label)}
          onChange={setRutaLabel}
        />

        {error ? <Text style={styles.warning}>{error}</Text> : renderDatos()}
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
