import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import AprobarCotizacionModal from '../../components/pedido/AprobarCotizacionModal';
import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { aprobarCotizacion, getCotizacionesCliente } from '../../repositories/pedidos';
import { isNetworkError } from '../../services/api';
import { descargarCotizacionPdf } from '../../services/documentoPdf';
import { formatFechaDoc, formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Cotizaciones por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

const ACCENT = colors.primary;

const aFila = (c) => ({
  ...c,
  fechaTexto: formatFechaDoc(c.fecha),
  totalTexto: formatMontoMoneda(c.total, c.moneda),
});

// Card de una cotización (seleccionable): número, fecha, artículos y total. Línea izquierda verde si
// ya está en el servidor (se puede imprimir) o naranja si solo está en el equipo.
function CotizacionCard({ cotizacion, selected, onPress }) {
  const { enviada } = cotizacion;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        enviada ? styles.cardEnviada : styles.cardPendiente,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.numero, selected && styles.numeroSelected]} numberOfLines={1}>
          {cotizacion.numero}
        </Text>
        <View style={styles.meta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>{cotizacion.fechaTexto || '—'}</Text>
        </View>
        <View style={styles.meta}>
          <Feather name="package" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {cotizacion.articulos} {cotizacion.articulos === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.total}>{cotizacion.totalTexto}</Text>
        <Text style={[styles.estado, enviada ? styles.estadoEnviada : styles.estadoPendiente]}>
          {enviada ? 'ENVIADA' : 'SOLO EN EQUIPO'}
        </Text>
      </View>
    </Pressable>
  );
}

// Validar cliente > Cotización: cotizaciones del cliente (capturadas en el equipo y descargadas en
// Datos > Cargar datos), en cards paginadas. "Nueva" abre la captura (mismas pantallas del pedido);
// al seleccionar una card (tocarla de nuevo quita la selección) se puede aprobar: pasa a pedido (TIP_DOC 'F') con fecha de hoy y la entrega que se elija, o
// imprimir: descarga su PDF del backend (requiere internet y que la cotización ya esté enviada).
// onNueva(): abrir la captura. onAprobada(numero): el contenedor registra la visita.
export default function CotizacionesView({ cliente, ruta, onBack, onNueva, onAprobada }) {
  const insets = useSafeAreaInsets();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [aprobar, setAprobar] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  const cargar = useCallback(
    () =>
      getCotizacionesCliente(cliente.codigo, ruta)
        .then((lista) => {
          setCotizaciones(lista.map(aFila));
          setError('');
        })
        .catch((e) => setError(e?.message || 'No se pudieron leer las cotizaciones.')),
    [cliente.codigo, ruta]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cotizacion = cotizaciones.find((c) => c.numero === seleccionado) ?? null;

  // Si al aprobar se vacía la última página, se vuelve a la anterior.
  const totalPages = Math.max(1, Math.ceil(cotizaciones.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagina = useMemo(
    () => cotizaciones.slice((page - 1) * pageSize, page * pageSize),
    [cotizaciones, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const imprimir = async () => {
    if (!cotizacion || generando) return;
    if (!cotizacion.enviada) {
      Alert.alert(
        'Imprimir cotización',
        `La cotización ${cotizacion.numero} aún no está en el servidor. Envíala en Datos > Enviar Datos y vuelve a intentar.`
      );
      return;
    }
    setGenerando(true);
    try {
      await descargarCotizacionPdf(cotizacion.compania, cotizacion.numero);
    } catch (e) {
      Alert.alert(
        'No se pudo descargar el PDF',
        isNetworkError(e)
          ? 'Debes estar conectado a internet para descargar el PDF de la cotización.'
          : e?.message || 'Intenta de nuevo.'
      );
    } finally {
      setGenerando(false);
    }
  };

  const handleAprobar = async (entrega) => {
    try {
      await aprobarCotizacion({ ruta, numero: cotizacion.numero, entrega, fecha: new Date() });
    } catch (e) {
      Alert.alert('No se pudo aprobar la cotización', e?.message || 'Error al actualizar la base local.');
      return;
    }
    const numero = cotizacion.numero;
    setAprobar(false);
    setSeleccionado(null);
    await cargar();
    Alert.alert('Cotización aprobada', `La cotización ${numero} pasó a pedido. Se subirá en Enviar Datos.`);
    await onAprobada?.(numero);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Cotizaciones" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cotizaciones.length ? (
          <>
            <Text style={styles.contador}>
              {cotizaciones.length} {cotizaciones.length === 1 ? 'cotización' : 'cotizaciones'}
              {cotizacion ? ` · seleccionada ${cotizacion.numero}` : ' · toca una para seleccionarla'}
            </Text>
            {pagina.map((c) => (
              <CotizacionCard
                key={c.numero}
                cotizacion={c}
                selected={c.numero === seleccionado}
                onPress={() => setSeleccionado((actual) => (actual === c.numero ? null : c.numero))}
              />
            ))}
            <Pagination
              page={Math.min(page, totalPages)}
              pageSize={pageSize}
              total={cotizaciones.length}
              onPageChange={irAPagina}
              onPageSizeChange={(n) => {
                setPageSize(n);
                irAPagina(1);
              }}
            />
          </>
        ) : !error ? (
          <View style={styles.empty}>
            <Feather name="file-text" size={32} color={colors.textDisabled} />
            <Text style={styles.emptyText}>El cliente no tiene cotizaciones pendientes. Usa "Nueva" para crear una.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          onPress={onNueva}
          style={({ pressed }) => [styles.action, styles.secondary, pressed && styles.pressed]}
        >
          <Feather name="plus" size={20} color={ACCENT} />
          <Text style={[styles.actionText, styles.secondaryText]}>Nueva</Text>
        </Pressable>
        <Pressable
          onPress={imprimir}
          disabled={!cotizacion || generando}
          style={({ pressed }) => [styles.action, styles.secondary, (pressed || !cotizacion) && styles.pressed]}
        >
          {generando ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Feather name="printer" size={20} color={ACCENT} />
          )}
          <Text style={[styles.actionText, styles.secondaryText]}>Imprimir</Text>
        </Pressable>
        <Pressable
          onPress={() => setAprobar(true)}
          disabled={!cotizacion}
          style={({ pressed }) => [styles.action, (pressed || !cotizacion) && styles.pressed]}
        >
          <Feather name="check-circle" size={20} color={colors.onPrimary} />
          <Text style={styles.actionText}>Aprobar</Text>
        </Pressable>
      </View>

      <AprobarCotizacionModal
        visible={aprobar && !!cotizacion}
        cliente={cliente}
        cotizacion={cotizacion}
        onAprobar={handleAprobar}
        onClose={() => setAprobar(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.sm + 2 },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  error: { fontSize: 12, color: colors.error },
  contador: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
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
  cardSelected: { borderColor: ACCENT, backgroundColor: '#FFF7F7' },
  cardEnviada: { borderLeftColor: colors.success },
  cardPendiente: { borderLeftColor: colors.warning },
  cardPressed: { opacity: 0.85 },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  cardBody: { flex: 1, gap: 3 },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  numeroSelected: { color: colors.primaryDark },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: colors.textMuted },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  estado: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  estadoEnviada: { color: colors.success },
  estadoPendiente: { color: '#B85F00' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondary: { backgroundColor: colors.primarySoft },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  secondaryText: { color: ACCENT },
  pressed: { opacity: 0.6 },
});
