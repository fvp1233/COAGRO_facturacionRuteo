import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import { opcionesEntrega } from '../../components/pedido/PedidoResumenModal';
import { ClienteHistorialCard, Etiqueta, historialStyles } from '../../components/historial/HistorialComun';
import {
  crearPromocional,
  eliminarPromocional,
  getPromocionalesCliente,
  MAX_NOTAS_PROMOCIONAL,
} from '../../repositories/promocionales';
import { formatFechaDoc } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;

// 'YYYY-MM-DD HH:MM:SS' -> 'DD/MM/YY HH:MM' (sin pasar por Date).
const fechaHora = (v) => {
  const hora = /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0];
  return `${formatFechaDoc(v)}${hora ? ` ${hora}` : ''}`;
};

// Card de una solicitud: fechas, notas y estado. Línea izquierda verde (procesada) o ámbar
// (pendiente). Las que aún no se envían llevan la etiqueta "Sin enviar" y se pueden eliminar.
function PromocionalCard({ promocional: p, onEliminar }) {
  return (
    <View style={[styles.card, { borderLeftColor: p.procesada ? colors.success : colors.warning }]}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={h.cardNumero}>{p.id ? `Solicitud ${p.id}` : 'Solicitud nueva'}</Text>
          <View style={h.cardMeta}>
            <Feather name="clock" size={12} color={colors.textMuted} />
            <Text style={h.cardMetaText}>Solicitada: {fechaHora(p.fechaSolicitud)}</Text>
          </View>
          <View style={h.cardMeta}>
            <Feather name="calendar" size={12} color={colors.textMuted} />
            <Text style={h.cardMetaText}>Requerida: {formatFechaDoc(p.fechaRequerida) || '—'}</Text>
          </View>
          {p.procesada && p.fechaProcesado ? (
            <View style={h.cardMeta}>
              <Feather name="check-circle" size={12} color={colors.textMuted} />
              <Text style={h.cardMetaText}>Procesada: {fechaHora(p.fechaProcesado)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.etiquetas}>
          <Etiqueta texto={p.procesada ? 'Procesada' : 'Pendiente'} tono={p.procesada ? 'verde' : 'ambar'} />
          {!p.enviado ? <Etiqueta texto="Sin enviar" tono="rojo" /> : null}
        </View>
      </View>
      <Text style={styles.notas}>{p.notas}</Text>
      {p.errorEnvio ? <Text style={h.error}>Error al enviar: {p.errorEnvio}</Text> : null}
      {!p.enviado ? (
        <Pressable onPress={onEliminar} hitSlop={6} style={({ pressed }) => [styles.eliminar, pressed && h.pressed]}>
          <Feather name="trash-2" size={14} color={colors.error} />
          <Text style={styles.eliminarText}>Eliminar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Validar > Promocionales: solicitudes de promocionales del cliente, en cards (las descargadas con
// Datos > Cargar datos y las creadas en el equipo), y el botón para registrar una nueva con la fecha
// requerida y las notas. Las nuevas quedan en el equipo como "Sin enviar".
export default function PromocionalesView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [promocionales, setPromocionales] = useState([]);
  const [descargado, setDescargado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Formulario de nueva solicitud.
  const [nueva, setNueva] = useState(false);
  const [notas, setNotas] = useState('');
  const [requerida, setRequerida] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const opciones = useMemo(() => (nueva ? opcionesEntrega(new Date()) : []), [nueva]);
  const requeridaActual =
    opciones.find((o) => requerida && o.fecha.getTime() === requerida.getTime()) ?? opciones[0] ?? null;

  const cargar = useCallback(async () => {
    try {
      const r = await getPromocionalesCliente(cliente.codigo);
      setPromocionales(r.promocionales);
      setDescargado(r.descargado);
      setError('');
    } catch (e) {
      setError(e?.message || 'No se pudieron leer las solicitudes de promocionales.');
    } finally {
      setCargando(false);
    }
  }, [cliente.codigo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNueva = () => {
    setNotas('');
    setRequerida(null);
    setNueva(true);
  };

  const guardar = async () => {
    if (guardando) return;
    if (!notas.trim()) {
      Alert.alert('Nueva solicitud', 'Escribe las notas de la solicitud.');
      return;
    }
    setGuardando(true);
    try {
      await crearPromocional({
        cliente: cliente.codigo,
        ruta,
        nombreCliente: cliente.nombre,
        notas,
        fechaRequerida: requeridaActual.fecha,
      });
      setNueva(false);
      await cargar();
      Alert.alert('Solicitud registrada', 'La solicitud quedó guardada en el equipo.');
    } catch (e) {
      Alert.alert('No se pudo guardar la solicitud', e?.message || 'Error al insertar en la base local.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = (p) => {
    Alert.alert('Eliminar solicitud', '¿Eliminar esta solicitud que aún no se envía?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarPromocional(p.cliente, p.fechaSolicitud);
            await cargar();
          } catch (e) {
            Alert.alert('No se pudo eliminar', e?.message || 'Error en la base local.');
          }
        },
      },
    ]);
  };

  const vacio = cargando
    ? 'Cargando las solicitudes...'
    : !descargado && !promocionales.length
      ? 'No hay solicitudes descargadas. Ve a Datos > Cargar datos o registra una nueva.'
      : 'Este cliente no tiene solicitudes de promocionales';

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Promocionales" onBack={onBack} />

      <ScrollView contentContainerStyle={h.content}>
        <ClienteHistorialCard cliente={cliente} ruta={ruta} descargado={descargado} />

        <Pressable onPress={abrirNueva} style={({ pressed }) => [h.printButton, pressed && h.pressed]}>
          <Feather name="plus" size={18} color={colors.onPrimary} />
          <Text style={h.printText}>Nueva solicitud</Text>
        </Pressable>

        {error ? <Text style={h.error}>{error}</Text> : null}

        {promocionales.length ? (
          <View style={h.lista}>
            <Text style={h.contador}>
              {promocionales.length} {promocionales.length === 1 ? 'solicitud' : 'solicitudes'}
            </Text>
            {promocionales.map((p) => (
              <PromocionalCard
                key={`${p.cliente}|${p.fechaSolicitud}`}
                promocional={p}
                onEliminar={() => eliminar(p)}
              />
            ))}
          </View>
        ) : (
          <View style={h.empty}>
            {cargando ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="package" size={28} color={colors.textDisabled} />
            )}
            <Text style={h.emptyText}>{vacio}</Text>
          </View>
        )}
      </ScrollView>

      {/* Nueva solicitud: fecha requerida y notas. */}
      <Modal visible={nueva} transparent animationType="slide" onRequestClose={() => setNueva(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNueva(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.flex}>
                <Text style={h.seccionLabel}>NUEVA SOLICITUD</Text>
                <Text style={styles.sheetTitulo} numberOfLines={2}>{cliente.nombre}</Text>
              </View>
              <Pressable onPress={() => setNueva(false)} hitSlop={10}>
                <Feather name="x" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              {requeridaActual ? (
                <SelectField
                  label="Fecha requerida"
                  value={requeridaActual.texto}
                  options={opciones.map((o) => o.texto)}
                  onChange={(texto) => setRequerida(opciones.find((o) => o.texto === texto)?.fecha ?? null)}
                />
              ) : null}
              <View>
                <View style={styles.notasHeader}>
                  <Text style={styles.label}>Notas (qué promocionales se solicitan)</Text>
                  <Text style={styles.label}>{notas.length}/{MAX_NOTAS_PROMOCIONAL}</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={notas}
                  onChangeText={setNotas}
                  placeholder="Ej.: 2 exhibidores y 50 afiches de Credelio"
                  placeholderTextColor={colors.textDisabled}
                  maxLength={MAX_NOTAS_PROMOCIONAL}
                  multiline
                  textAlignVertical="top"
                />
              </View>
              <Pressable
                onPress={guardar}
                disabled={guardando}
                style={({ pressed }) => [h.printButton, (pressed || guardando) && h.pressed]}
              >
                {guardando ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Feather name="save" size={18} color={colors.onPrimary} />
                )}
                <Text style={h.printText}>Guardar solicitud</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  etiquetas: { alignItems: 'flex-end', gap: 4 },
  notas: { fontSize: 13, color: colors.text },
  eliminar: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  eliminarText: { fontSize: 12, fontWeight: '700', color: colors.error },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md + 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 4,
    paddingBottom: spacing.sm,
  },
  sheetTitulo: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  sheetContent: { paddingHorizontal: spacing.md + 4, paddingTop: spacing.xs, gap: spacing.md },
  notasHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 12, color: colors.textMuted },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
