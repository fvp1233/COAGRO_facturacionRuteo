import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { getDocumentosCobro } from '../../repositories/cobros';
import { descargarDocumentoPdf } from '../../services/documentoPdf';
import { isNetworkError } from '../../services/api';
import { formatFechaDoc, formatMonto, formatVendedor } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const claveDoc = (d) => `${d.codTipo}|${d.documento}`;

// Documentos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Días entre hoy y la fecha de vencimiento ('YYYY-MM-DD...'): negativo = vencido. null si no hay fecha.
const diasParaVencer = (vence) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(vence ?? '');
  if (!m) return null;
  const venc = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((venc - hoy) / 86400000);
};

// Estado de vencimiento: color de la línea izquierda y de la etiqueta.
const ESTADO = {
  vencido: { color: colors.primary, fondo: '#FDE3E2', texto: '#A31A13' },
  proximo: { color: colors.warning, fondo: '#FEEBD3', texto: '#B85F00' },
  alDia: { color: colors.success, fondo: '#E3F2F1', texto: colors.success },
  sinFecha: { color: colors.border, fondo: colors.surface, texto: colors.textMuted },
};
const DIAS_PROXIMO = 7;

const estadoDe = (dias) => {
  if (dias === null) return { ...ESTADO.sinFecha, label: 'SIN FECHA' };
  if (dias < 0) return { ...ESTADO.vencido, label: `VENCIDO HACE ${-dias} ${-dias === 1 ? 'DÍA' : 'DÍAS'}` };
  if (dias === 0) return { ...ESTADO.proximo, label: 'VENCE HOY' };
  if (dias <= DIAS_PROXIMO) return { ...ESTADO.proximo, label: `VENCE EN ${dias} ${dias === 1 ? 'DÍA' : 'DÍAS'}` };
  return { ...ESTADO.alDia, label: 'AL DÍA' };
};

// Saldo en la moneda del documento (IND_MON = 'D' → dólar; si no, local). Vendedor = agente dueño
// de la ruta del documento (igual que en el Calendario).
const aDocumento = (d) => {
  const enDolar = String(d.moneda).toUpperCase().startsWith('D');
  const dias = diasParaVencer(d.vence);
  return {
    codTipo: d.codTipo,
    tipo: d.tipo,
    documento: d.documento,
    emision: formatFechaDoc(d.fecha),
    vence: formatFechaDoc(d.vence),
    saldo: Number((enDolar ? d.saldoDocDolar : d.saldoDocLocal) ?? 0),
    monto: enDolar ? d.montoDocDolar : d.montoDocLocal,
    vendedor: formatVendedor(d),
    dias,
    estado: estadoDe(dias),
  };
};

// Card compacta: documento, vencimiento y saldo. La línea izquierda indica el estado de vencimiento.
function DocumentoCard({ doc, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: doc.estado.color }, pressed && styles.pressed]}
    >
      <View style={styles.cardTitle}>
        <Text style={styles.numero} numberOfLines={1}>{doc.documento}</Text>
        <View style={styles.venceLine}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={styles.venceText}>Vence {doc.vence || '—'}</Text>
        </View>
      </View>
      <Text style={styles.saldo}>{formatMonto(doc.saldo)}</Text>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

function Dato({ label, valor }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoLabel}>{label}</Text>
      <Text style={styles.datoValor}>{valor || '—'}</Text>
    </View>
  );
}

// Popup con toda la información del documento y el botón Imprimir.
function DocumentoModal({ doc, imprimiendo, onImprimir, onClose }) {
  return (
    <Modal visible={Boolean(doc)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {doc ? (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.cardTitle}>
                  <Text style={styles.tipo} numberOfLines={1}>{doc.tipo || 'Documento'}</Text>
                  <Text style={styles.sheetNumero} selectable>{doc.documento}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Feather name="x" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={[styles.badge, { backgroundColor: doc.estado.fondo }]}>
                <Text style={[styles.badgeText, { color: doc.estado.texto }]}>{doc.estado.label}</Text>
              </View>

              <View style={styles.sheetSaldo}>
                <Text style={styles.saldoLabel}>SALDO PENDIENTE</Text>
                <Text style={styles.sheetSaldoValor}>{formatMonto(doc.saldo)}</Text>
              </View>

              <View style={styles.datos}>
                <View style={styles.datosFila}>
                  <Dato label="Emisión" valor={doc.emision} />
                  <Dato label="Vence" valor={doc.vence} />
                </View>
                <View style={styles.datosFila}>
                  <Dato label="Monto original" valor={doc.monto != null ? formatMonto(doc.monto) : null} />
                  <Dato label="Vendedor" valor={doc.vendedor} />
                </View>
              </View>

              <Pressable
                onPress={onImprimir}
                disabled={imprimiendo}
                style={({ pressed }) => [styles.printButton, pressed && styles.pressed]}
              >
                {imprimiendo ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Feather name="printer" size={18} color={colors.onPrimary} />
                )}
                <Text style={styles.printText}>Imprimir</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Menú Consultar > Cobros: documentos pendientes de cobro del cliente seleccionado (alCXC_PEN_COB,
// los mismos de Cobros; se descargan con Datos > Cargar datos).
// Al tocar una card se abre un popup con el detalle y el botón Imprimir: descarga el PDF del backend
// (requiere internet) y abre el menú del sistema para guardarlo o compartirlo (se imprime desde el celular).
export default function ConsultaCobrosView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelado = false;
    getDocumentosCobro({ cliente: cliente.codigo, ruta })
      .then((lista) => {
        if (!cancelado) setDocumentos(lista.map(aDocumento));
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los documentos.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const resumen = useMemo(
    () => ({
      total: documentos.reduce((s, d) => s + d.saldo, 0),
      vencidos: documentos.filter((d) => d.dias !== null && d.dias < 0).length,
    }),
    [documentos]
  );

  // Solo se renderiza la página actual; el resumen usa todos los documentos.
  const pagina = useMemo(
    () => documentos.slice((page - 1) * pageSize, page * pageSize),
    [documentos, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const imprimir = async (doc) => {
    if (!doc || imprimiendo) return;
    setImprimiendo(true);
    try {
      await descargarDocumentoPdf(doc.documento);
    } catch (e) {
      Alert.alert(
        'No se pudo descargar el PDF',
        isNetworkError(e)
          ? 'Debes estar conectado a internet para descargar el PDF del documento.'
          : e?.message || 'Intenta de nuevo.'
      );
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Cobros" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.resumen}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
          <View style={styles.resumenFila}>
            <View>
              <Text style={styles.saldoLabel}>SALDO PENDIENTE</Text>
              <Text style={styles.resumenTotal}>{formatMonto(resumen.total)}</Text>
            </View>
            <View style={styles.resumenChips}>
              <View style={styles.chip}>
                <Feather name="file-text" size={12} color={colors.textMuted} />
                <Text style={styles.chipText}>
                  {documentos.length} {documentos.length === 1 ? 'documento' : 'documentos'}
                </Text>
              </View>
              {resumen.vencidos ? (
                <View style={[styles.chip, styles.chipVencido]}>
                  <Feather name="alert-circle" size={12} color="#A31A13" />
                  <Text style={[styles.chipText, styles.chipVencidoText]}>
                    {resumen.vencidos} {resumen.vencidos === 1 ? 'vencido' : 'vencidos'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : documentos.length ? (
          <>
            {pagina.map((d) => (
              <DocumentoCard key={claveDoc(d)} doc={d} onPress={() => setDetalle(d)} />
            ))}
            <View style={styles.paginacion}>
              <Pagination
                page={page}
                pageSize={pageSize}
                total={documentos.length}
                onPageChange={irAPagina}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  irAPagina(1);
                }}
              />
            </View>
          </>
        ) : !error ? (
          <View style={styles.empty}>
            <Feather name="check-circle" size={32} color={colors.success} />
            <Text style={styles.emptyText}>El cliente no tiene documentos pendientes de cobro</Text>
          </View>
        ) : null}
      </ScrollView>

      <DocumentoModal
        doc={detalle}
        imprimiendo={imprimiendo}
        onImprimir={() => imprimir(detalle)}
        onClose={() => setDetalle(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.sm + 2 },
  resumen: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  resumenFila: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  resumenTotal: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
  resumenChips: { alignItems: 'flex-end', gap: 6 },
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
  chipVencido: { backgroundColor: '#FDE3E2' },
  chipVencidoText: { color: '#A31A13' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm + 4,
    paddingRight: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTitle: { flex: 1 },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  venceLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  venceText: { fontSize: 12, color: colors.textMuted },
  saldo: { fontSize: 16, fontWeight: '800', color: colors.text },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tipo: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted, textTransform: 'uppercase' },
  sheetNumero: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    marginTop: -spacing.xs,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sheetSaldo: { alignItems: 'center', paddingVertical: spacing.xs },
  saldoLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  sheetSaldoValor: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  datos: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    gap: spacing.sm + 4,
  },
  datosFila: { flexDirection: 'row', gap: spacing.sm },
  dato: { flex: 1 },
  datoLabel: { fontSize: 11, color: colors.textMuted },
  datoValor: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 1 },
  printButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  printText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  loading: { marginTop: spacing.lg },
  paginacion: { marginTop: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { fontSize: 12, color: colors.error },
});
