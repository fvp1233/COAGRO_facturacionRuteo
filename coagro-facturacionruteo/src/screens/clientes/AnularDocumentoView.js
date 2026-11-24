import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { TabsHistorial } from '../../components/historial/HistorialComun';
import { anularDocumento, getDocumentosDelDia } from '../../repositories/pedidos';
import { formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Documentos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

const ACCENT = colors.primary;

// Textos de cada tipo de documento (TIP_DOC 'F' pedido | 'C' cotización).
const TEXTOS = {
  F: {
    titulo: 'Anular pedido',
    uno: 'pedido',
    varios: 'pedidos',
    El: 'El pedido',
    seleccionado: 'seleccionado',
    anulado: 'Pedido anulado',
    ultimo: 'Solo se puede anular el último pedido que aún no se envió. Para anular uno anterior, anula primero los más recientes.',
    proximo: 'El próximo pedido usará ese número.',
    vacio: 'No hay pedidos de hoy en el equipo para esta ruta.',
    icono: 'shopping-cart',
  },
  C: {
    titulo: 'Anular cotización',
    uno: 'cotización',
    varios: 'cotizaciones',
    El: 'La cotización',
    seleccionado: 'seleccionada',
    anulado: 'Cotización anulada',
    ultimo: 'Solo se puede anular la última cotización que aún no se envió. Para anular una anterior, anula primero las más recientes.',
    proximo: 'La próxima cotización usará ese número.',
    vacio: 'No hay cotizaciones de hoy en el equipo para esta ruta.',
    icono: 'file-text',
  },
};

// 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'.
const horaCorta = (v) => (v ? String(v).slice(11, 16) : '');

// Card de un documento del día. Solo el que se puede anular es seleccionable; los demás muestran el motivo.
function DocumentoCard({ documento, selected, esDelCliente, onPress }) {
  const { anulable } = documento;
  return (
    <Pressable
      onPress={anulable ? onPress : undefined}
      disabled={!anulable}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        anulable ? styles.cardAnulable : styles.cardBloqueado,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.check, selected && styles.checkSelected, !anulable && styles.checkOff]}>
        {selected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
        {!anulable ? <Feather name="lock" size={11} color={colors.textDisabled} /> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.numero, selected && styles.numeroSelected]} numberOfLines={1}>
          {documento.numero}
        </Text>
        <View style={styles.meta}>
          <Feather name="user" size={12} color={esDelCliente ? ACCENT : colors.textMuted} />
          <Text style={[styles.metaText, esDelCliente && styles.metaCliente]} numberOfLines={1}>
            {documento.nombreCliente}
          </Text>
        </View>
        <View style={styles.meta}>
          <Feather name="clock" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {horaCorta(documento.hora) || '—'} · {documento.articulos} {documento.articulos === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
        {!anulable ? <Text style={styles.motivo}>{documento.motivo}</Text> : null}
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.total}>{formatMontoMoneda(documento.total, documento.moneda)}</Text>
        <Text style={[styles.estado, documento.enviado ? styles.estadoEnviado : styles.estadoPendiente]}>
          {documento.enviado ? 'ENVIADO' : 'SOLO EN EQUIPO'}
        </Text>
      </View>
    </Pressable>
  );
}

// Pestañas del Menú Anular (TIP_DOC 'F' pedido | 'C' cotización).
const TABS = [
  { key: 'F', label: 'Pedidos' },
  { key: 'C', label: 'Cotizaciones' },
];

// Validar cliente > Menú Anular: pestañas Pedidos / Cotizaciones con los documentos de hoy de ese tipo
// guardados en el equipo para la ruta (de todos los clientes). Solo se puede anular el último que aún
// no se envió: se borra del equipo, el consecutivo de su tipo en la ruta regresa uno (el próximo
// documento reutiliza ese número) y su visita pasa a "Sin necesidad de compra" (ver anularDocumento).
export default function AnularDocumentoView({ cliente, ruta, onBack }) {
  const [tipoDoc, setTipoDoc] = useState('F');
  const t = TEXTOS[tipoDoc];
  const insets = useSafeAreaInsets();
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);
  // Pestaña de la última lectura: si se cambia de pestaña mientras lee, la respuesta vieja se descarta.
  const tipoActual = useRef(tipoDoc);
  tipoActual.current = tipoDoc;

  const cargar = useCallback(
    () =>
      getDocumentosDelDia(ruta, tipoDoc)
        .then((lista) => {
          if (tipoActual.current !== tipoDoc) return;
          setDocumentos(lista);
          setError('');
        })
        .catch((e) => {
          if (tipoActual.current === tipoDoc) setError(e?.message || `No se pudieron leer los ${TEXTOS[tipoDoc].varios} del día.`);
        })
        .finally(() => {
          if (tipoActual.current === tipoDoc) setCargando(false);
        }),
    [ruta, tipoDoc]
  );

  // Al cambiar de pestaña: lista vacía mientras lee, sin selección y en la primera página.
  const cambiarTab = (key) => {
    if (key === tipoDoc || anulando) return;
    setTipoDoc(key);
    setDocumentos([]);
    setCargando(true);
    setError('');
    setSeleccionado(null);
    irAPagina(1);
  };

  useEffect(() => {
    cargar();
  }, [cargar]);

  const documento = documentos.find((d) => d.numero === seleccionado && d.anulable) ?? null;

  // Si al anular se vacía la última página, se vuelve a la anterior.
  const totalPages = Math.max(1, Math.ceil(documentos.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pagina = useMemo(
    () => documentos.slice((page - 1) * pageSize, page * pageSize),
    [documentos, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const ejecutarAnulacion = async (d) => {
    setAnulando(true);
    let visitaActualizada = false;
    try {
      ({ visitaActualizada } = await anularDocumento({ ruta, numero: d.numero, tipoDoc }));
    } catch (e) {
      Alert.alert(`No se pudo anular ${t.El.toLowerCase()}`, e?.message || 'Error al actualizar la base local.');
      await cargar();
      return;
    } finally {
      setAnulando(false);
    }
    setSeleccionado(null);
    await cargar();
    Alert.alert(
      t.anulado,
      `${t.El} ${d.numero} se eliminó del equipo. ${t.proximo}` +
        (visitaActualizada ? `\n\nLa visita quedó como "Sin necesidad de compra" con la nota "${t.anulado}".` : '')
    );
  };

  const confirmarAnular = () => {
    if (!documento || anulando) return;
    Alert.alert(
      t.titulo,
      `¿Anular ${t.El.toLowerCase()} ${documento.numero} de ${documento.nombreCliente} por ${formatMontoMoneda(documento.total, documento.moneda)}? Se eliminará del equipo y no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Anular', style: 'destructive', onPress: () => ejecutarAnulacion(documento) },
      ]
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Menú Anular" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <TabsHistorial tab={tipoDoc} onChange={cambiarTab} tabs={TABS} />

        <View style={styles.infoCard}>
          <Text style={styles.infoTitulo}>
            {t.varios.charAt(0).toUpperCase() + t.varios.slice(1)} de hoy{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
          <Text style={styles.infoTexto}>{t.ultimo}</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator style={styles.loading} color={ACCENT} />
        ) : documentos.length ? (
          <>
            <Text style={styles.contador}>
              {documentos.length} {documentos.length === 1 ? t.uno : t.varios}
              {documento ? ` · ${t.seleccionado} ${documento.numero}` : ''}
            </Text>
            {pagina.map((d) => (
              <DocumentoCard
                key={d.numero}
                documento={d}
                selected={d.numero === documento?.numero}
                esDelCliente={String(d.cliente).trim() === String(cliente.codigo).trim()}
                onPress={() => setSeleccionado((actual) => (actual === d.numero ? null : d.numero))}
              />
            ))}
            <Pagination
              page={Math.min(page, totalPages)}
              pageSize={pageSize}
              total={documentos.length}
              onPageChange={irAPagina}
              onPageSizeChange={(n) => {
                setPageSize(n);
                irAPagina(1);
              }}
            />
          </>
        ) : !error ? (
          <View style={styles.empty}>
            <Feather name={t.icono} size={32} color={colors.textDisabled} />
            <Text style={styles.emptyText}>{t.vacio}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          onPress={confirmarAnular}
          disabled={!documento || anulando}
          style={({ pressed }) => [styles.action, (pressed || !documento || anulando) && styles.pressed]}
        >
          {anulando ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Feather name="x-circle" size={20} color={colors.onPrimary} />
          )}
          <Text style={styles.actionText}>{t.titulo}</Text>
        </Pressable>
      </View>
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
    gap: 4,
  },
  infoTitulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  infoTexto: { fontSize: 12, color: colors.textMuted },
  error: { fontSize: 12, color: colors.error },
  loading: { marginTop: spacing.lg },
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
  cardAnulable: { borderLeftColor: ACCENT },
  cardBloqueado: { borderLeftColor: colors.border },
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
  checkOff: { backgroundColor: colors.surface },
  cardBody: { flex: 1, gap: 3 },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  numeroSelected: { color: colors.primaryDark },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flexShrink: 1, fontSize: 12, color: colors.textMuted },
  metaCliente: { color: ACCENT, fontWeight: '600' },
  motivo: { fontSize: 11, fontStyle: 'italic', color: colors.textMuted },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  estado: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  estadoEnviado: { color: colors.success },
  estadoPendiente: { color: '#B85F00' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  bar: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.6 },
});
