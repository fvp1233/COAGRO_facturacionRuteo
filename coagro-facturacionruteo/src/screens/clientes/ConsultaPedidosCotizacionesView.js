import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { TabsHistorial } from '../../components/historial/HistorialComun';
import { getDocumentosEquipoCliente, TIPOS_PEDIDO } from '../../repositories/pedidos';
import { imprimirPedido } from '../../services/pedidoPdf';
import { formatFechaDoc, formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Documentos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

const ACCENT = colors.primary;

const TABS = [
  { key: 'pedido', label: 'Pedidos' },
  { key: 'cotizacion', label: 'Cotizaciones' },
];

// Textos de cada pestaña.
const TEXTOS = {
  pedido: {
    uno: 'pedido',
    varios: 'pedidos',
    seleccionado: 'Seleccionado',
    tocar: 'Toca un pedido para seleccionarlo e imprimirlo',
    icono: 'shopping-cart',
    vacio: 'No le has hecho pedidos a este cliente desde este equipo.',
    nota: 'Los pedidos ya enviados se borran del equipo al cargar datos; el historial completo está en Validar > Menú Consultar > Pedidos.',
  },
  cotizacion: {
    uno: 'cotización',
    varios: 'cotizaciones',
    seleccionado: 'Seleccionada',
    tocar: 'Toca una cotización para seleccionarla e imprimirla',
    icono: 'file-text',
    vacio: 'El cliente no tiene cotizaciones en el equipo.',
    nota: 'Se muestran las hechas desde este equipo y las pendientes descargadas con Cargar datos.',
  },
};

// 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'.
const horaCorta = (v) => (v ? String(v).slice(11, 16) : '');

// Card de un pedido o cotización (seleccionable): número, fecha y hora, entrega, artículos y total.
// Línea izquierda verde si ya está en el servidor, naranja si solo está en el equipo y roja si el envío
// falló.
function DocumentoCard({ doc, selected, onPress }) {
  const conError = !doc.enviado && Boolean(doc.errorEnvio);
  const estado = doc.enviado ? 'ENVIADO' : conError ? 'ERROR AL ENVIAR' : 'SOLO EN EQUIPO';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        doc.enviado ? styles.cardEnviado : conError ? styles.cardError : styles.cardPendiente,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Feather name="check" size={14} color={colors.onPrimary} /> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.numero, selected && styles.numeroSelected]} numberOfLines={1}>
          {doc.numero}
        </Text>
        <View style={styles.meta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {formatFechaDoc(doc.fecha) || '—'}
            {horaCorta(doc.hora) ? ` · ${horaCorta(doc.hora)}` : ''}
          </Text>
        </View>
        {doc.entrega ? (
          <View style={styles.meta}>
            <Feather name="truck" size={12} color={colors.textMuted} />
            <Text style={styles.metaText}>Entrega {formatFechaDoc(doc.entrega)}</Text>
          </View>
        ) : null}
        <View style={styles.meta}>
          <Feather name="package" size={12} color={colors.textMuted} />
          <Text style={styles.metaText}>
            {doc.articulos} {doc.articulos === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
        {conError ? (
          <Text style={styles.errorEnvio} numberOfLines={2}>
            {doc.errorEnvio}
          </Text>
        ) : null}
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.total}>{formatMontoMoneda(doc.total, doc.moneda)}</Text>
        <Text
          style={[styles.estado, doc.enviado ? styles.estadoEnviado : conError ? styles.estadoError : styles.estadoPendiente]}
        >
          {estado}
        </Text>
      </View>
    </Pressable>
  );
}

// Consulta > Pedidos y cotizaciones: pedidos y cotizaciones del cliente que están en el equipo, en dos
// pestañas (sin registrar visita). Al seleccionar uno se puede imprimir: PDF del servidor si ya se
// envió y hay conexión; si no, se arma en el equipo (services/pedidoPdf).
export default function ConsultaPedidosCotizacionesView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('pedido');
  // Listas de las dos pestañas (se leen juntas al abrir).
  const [listas, setListas] = useState({ pedido: [], cotizacion: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      getDocumentosEquipoCliente(cliente.codigo, ruta, TIPOS_PEDIDO.pedido.tipoDoc),
      getDocumentosEquipoCliente(cliente.codigo, ruta, TIPOS_PEDIDO.cotizacion.tipoDoc),
    ])
      .then(([pedido, cotizacion]) => {
        if (!cancelado) setListas({ pedido, cotizacion });
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los documentos del cliente.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const t = TEXTOS[tab];
  const documentos = listas[tab];
  const doc = documentos.find((d) => d.numero === seleccionado) ?? null;

  const resumen = useMemo(
    () => ({
      pendientes: documentos.filter((d) => !d.enviado).length,
      enviados: documentos.filter((d) => d.enviado).length,
    }),
    [documentos]
  );

  const totalPages = Math.max(1, Math.ceil(documentos.length / pageSize));
  const pagina = useMemo(
    () => documentos.slice((page - 1) * pageSize, page * pageSize),
    [documentos, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Al cambiar de pestaña se quita la selección y se vuelve a la primera página.
  const cambiarTab = (key) => {
    if (key === tab) return;
    setTab(key);
    setSeleccionado(null);
    irAPagina(1);
  };

  const imprimir = async () => {
    if (!doc || generando) return;
    setGenerando(true);
    try {
      // Enviado y con conexión: PDF del servidor; si no, se arma en el equipo.
      await imprimirPedido({ ruta, numero: doc.numero, compania: doc.compania, cotizacion: tab === 'cotizacion' });
    } catch (e) {
      Alert.alert('No se pudo generar el PDF', e?.message || 'Intenta de nuevo.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Pedidos y cotizaciones de este cliente hechos en el equipo. Selecciona uno para imprimirlo.'} title="Pedidos y cotizaciones" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
        </View>

        <TabsHistorial
          tab={tab}
          onChange={cambiarTab}
          tabs={TABS.map((x) => (cargando ? x : { ...x, label: `${x.label} (${listas[x.key].length})` }))}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator style={styles.loading} color={ACCENT} />
        ) : documentos.length ? (
          <>
            <View style={styles.chips}>
              <View style={styles.chip}>
                <Feather name={t.icono} size={12} color={colors.textMuted} />
                <Text style={styles.chipText}>
                  {documentos.length} {documentos.length === 1 ? t.uno : t.varios}
                </Text>
              </View>
              {resumen.pendientes ? (
                <View style={[styles.chip, styles.chipPendiente]}>
                  <Feather name="upload-cloud" size={12} color="#B85F00" />
                  <Text style={[styles.chipText, styles.chipPendienteText]}>{resumen.pendientes} sin enviar</Text>
                </View>
              ) : null}
              {resumen.enviados ? (
                <View style={[styles.chip, styles.chipEnviado]}>
                  <Feather name="check" size={12} color={colors.success} />
                  <Text style={[styles.chipText, styles.chipEnviadoText]}>
                    {resumen.enviados} {resumen.enviados === 1 ? 'enviado' : 'enviados'}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.contador}>{doc ? `${t.seleccionado} ${doc.numero}` : t.tocar}</Text>
            {pagina.map((d) => (
              <DocumentoCard
                key={d.numero}
                doc={d}
                selected={d.numero === seleccionado}
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
            <Text style={styles.emptyNota}>{t.nota}</Text>
          </View>
        ) : null}
      </ScrollView>

      {documentos.length ? (
        <View style={styles.bar}>
          <Pressable
            onPress={imprimir}
            disabled={!doc || generando}
            style={({ pressed }) => [styles.action, (pressed || !doc) && styles.pressed]}
          >
            {generando ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Feather name="printer" size={20} color={colors.onPrimary} />
            )}
            <Text style={styles.actionText}>Imprimir</Text>
          </Pressable>
        </View>
      ) : null}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipPendiente: { backgroundColor: '#FEEBD3' },
  chipPendienteText: { color: '#B85F00' },
  chipEnviado: { backgroundColor: '#E3F2F1' },
  chipEnviadoText: { color: colors.success },
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
  cardEnviado: { borderLeftColor: colors.success },
  cardPendiente: { borderLeftColor: colors.warning },
  cardError: { borderLeftColor: colors.error },
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
  errorEnvio: { fontSize: 11, color: colors.error },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  estado: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  estadoEnviado: { color: colors.success },
  estadoPendiente: { color: '#B85F00' },
  estadoError: { color: colors.error },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyNota: { fontSize: 12, color: colors.textDisabled, textAlign: 'center' },
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
