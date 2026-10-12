import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import { getEfectividades } from '../../repositories/visitas';
import { colors, radius, spacing } from '../../theme';

const ACCENT = '#15803D';
const TIPOS_VISITA = ['Real', 'Telefónica'];

const pad = (n) => String(n).padStart(2, '0');

// DD/MM/YY
export function formatFecha(d) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${pad(d.getFullYear() % 100)}`;
}

// 9:45 PM
export function formatHora(d) {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

// Registro de visita del cliente. inicio = hora en que se abrió Validar; fin = hora en que se cerró.
// onGuardar(visita) recibe todos los datos para insertarlos (la inserción se conecta en el contenedor).
export default function VisitaRegistroView({ cliente, ruta, inicio, fin, onBack, onGuardar }) {
  const insets = useSafeAreaInsets();
  const [tipo, setTipo] = useState(TIPOS_VISITA[0]);
  // Estados de visita descargados del sistema en línea (EFECT_VISITA_RT): [{ codigo, descripcion }].
  const [estados, setEstados] = useState([]);
  const [estado, setEstado] = useState('');
  const [notas, setNotas] = useState('');
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [coords, setCoords] = useState(null);
  const [cargandoGps, setCargandoGps] = useState(false);
  const [errorGps, setErrorGps] = useState('');

  const obtenerUbicacion = useCallback(async () => {
    setCargandoGps(true);
    setErrorGps('');
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        setErrorGps('Permiso de ubicación denegado.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        altitud: pos.coords.altitude ?? null,
        tiempo: pos.timestamp,
      });
    } catch {
      setErrorGps('No se pudo obtener la ubicación. Verifica que el GPS esté activado.');
    } finally {
      setCargandoGps(false);
    }
  }, []);

  useEffect(() => {
    obtenerUbicacion();
  }, [obtenerUbicacion]);

  useEffect(() => {
    let cancelado = false;
    getEfectividades()
      .then((lista) => {
        if (cancelado) return;
        setEstados(lista);
        setEstado((actual) => actual || lista[0]?.descripcion || '');
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const guardar = () => {
    const razon = estados.find((e) => e.descripcion === estado)?.codigo;
    if (!razon) {
      Alert.alert('Estado requerido', 'No hay estados de visita. Ve a Datos > Cargar datos para descargarlos.');
      return;
    }
    onGuardar?.({
      cliente: cliente.codigo,
      ruta,
      fecha: fin,
      inicio,
      fin,
      tipo: tipo === 'Telefónica' ? 'T' : 'R',
      razon,
      estado,
      notas,
      ubicacion: coords,
    });
  };

  if (editandoNotas) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="dark" />
        <CenteredHeader title="Notas de la visita" onBack={() => setEditandoNotas(false)} />
        <View style={styles.notesBody}>
          <TextInput
            style={styles.notesInput}
            multiline
            textAlignVertical="top"
            placeholder="Escribe una descripción o nota de la visita..."
            placeholderTextColor={colors.placeholder}
            value={notas}
            onChangeText={setNotas}
            autoFocus
          />
        </View>
        <View style={styles.bar}>
          <ActionButton icon="check" label="Listo" onPress={() => setEditandoNotas(false)} primary />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Registro de visita" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field label="Cliente" value={cliente.nombre} />
          <View style={styles.row}>
            <Field label="Fecha" value={formatFecha(fin)} style={styles.half} />
          </View>
          <View style={styles.row}>
            <Field label="Hora inicio" value={formatHora(inicio)} style={styles.half} />
            <Field label="Hora fin" value={formatHora(fin)} style={styles.half} />
          </View>
        </View>

        <View style={styles.card}>
          <SelectField label="Tipo de visita" value={tipo} options={TIPOS_VISITA} onChange={setTipo} />
          <SelectField
            label="Estado"
            value={estado || 'Sin estados (cargar datos)'}
            options={estados.map((e) => e.descripcion)}
            onChange={setEstado}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.locHeader}>
            <Text style={styles.sectionTitle}>Ubicación actual</Text>
            <Pressable onPress={obtenerUbicacion} hitSlop={8} disabled={cargandoGps}>
              {cargandoGps ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                <Feather name="refresh-cw" size={16} color={ACCENT} />
              )}
            </Pressable>
          </View>
          {errorGps ? <Text style={styles.error}>{errorGps}</Text> : null}
          <View style={styles.row}>
            <Field label="Latitud" value={coords ? coords.latitud.toFixed(6) : '—'} style={styles.half} />
            <Field label="Longitud" value={coords ? coords.longitud.toFixed(6) : '—'} style={styles.half} />
          </View>
        </View>

        {notas ? (
          <View style={styles.card}>
            <Text style={styles.label}>Notas</Text>
            <Text style={styles.value}>{notas}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <ActionButton icon="edit-3" label="Notas" onPress={() => setEditandoNotas(true)} />
        <ActionButton icon="check" label="Guardar" onPress={guardar} primary />
      </View>
    </View>
  );
}

function Field({ label, value, style }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.value} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress, primary }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.pressed]}
    >
      <Feather name={icon} size={22} color={primary ? '#FFFFFF' : ACCENT} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5FA' },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: '#F3F5F9',
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  value: { fontSize: 14, color: colors.textPrimary },
  locHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  error: { fontSize: 12, color: '#991B1B' },
  bar: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  action: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionPrimary: { backgroundColor: ACCENT },
  actionText: { fontSize: 15, fontWeight: '700', color: ACCENT },
  actionTextPrimary: { color: '#FFFFFF' },
  pressed: { opacity: 0.8 },
  notesBody: { flex: 1, padding: spacing.md },
  notesInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
