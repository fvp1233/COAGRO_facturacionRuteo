import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { getDocumentosCobro } from '../../repositories/cobros';
import { FORMAS_PAGO, getRecibosCliente } from '../../repositories/pagos';
import { formatFechaDoc, formatMonto, formatVendedor } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const claveDoc = (d) => `${d.codTipo}|${d.documento}`;

// Documentos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// true si la fecha de vencimiento ('YYYY-MM-DD...') ya pasó.
const estaVencido = (vence) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(vence ?? '');
  if (!m) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) < hoy;
};

// Card de un documento: número, emisión/vencimiento, vendedor y saldo en la moneda del cobro.
// La línea izquierda es roja si está vencido.
function DocumentoCard({ doc, enDolar, onPress }) {
  const vencido = estaVencido(doc.vence);
  const abonado = enDolar ? doc.abonadoDolar : doc.abonadoLocal;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docCard,
        { borderLeftColor: vencido ? colors.primary : colors.success },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.docTitle}>
        <Text style={styles.numero}>{doc.documento}</Text>
        <View style={styles.venceLine}>
          <Feather name="file-text" size={12} color={colors.textMuted} />
          <Text style={styles.venceText}>Hecho {formatFechaDoc(doc.fecha) || '—'}</Text>
        </View>
        <View style={styles.venceLine}>
          <Feather name="calendar" size={12} color={vencido ? '#A31A13' : colors.textMuted} />
          <Text style={[styles.venceText, vencido && styles.venceVencido]}>
            Vence {formatFechaDoc(doc.vence) || '—'}
          </Text>
        </View>
        <Text style={styles.vendedor} numberOfLines={1}>{formatVendedor(doc)}</Text>
      </View>
      <View style={styles.docMontos}>
        <Text style={styles.saldoLabel}>SALDO</Text>
        <Text style={styles.saldo}>{formatMonto(enDolar ? doc.saldoDocDolar : doc.saldoDocLocal)}</Text>
        {abonado > 0 ? <Text style={styles.abonado}>Abonado {formatMonto(abonado)}</Text> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

function Dato({ label, valor }) {
  return (
    <View style={styles.dato}>
      <Text style={styles.datoLabel}>{label}</Text>
      <Text style={styles.datoValor} numberOfLines={1}>{valor || '—'}</Text>
    </View>
  );
}

// Popup con toda la información del documento (en la moneda del cobro) y el botón Pagar.
function DocumentoModal({ doc, enDolar, onPagar, onClose }) {
  const vencido = doc ? estaVencido(doc.vence) : false;
  return (
    <Modal visible={Boolean(doc)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {doc ? (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.docTitle}>
                  <Text style={styles.tipo} numberOfLines={1}>{doc.tipo || 'Documento'}</Text>
                  <Text style={styles.sheetNumero} selectable>{doc.documento}</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Feather name="x" size={22} color={colors.textMuted} />
                </Pressable>
              </View>

              <View style={[styles.badge, vencido ? styles.badgeVencido : styles.badgeAlDia]}>
                <Text style={[styles.badgeText, { color: vencido ? '#A31A13' : colors.success }]}>
                  {vencido ? 'VENCIDO' : 'AL DÍA'}
                </Text>
              </View>

              <View style={styles.sheetSaldo}>
                <Text style={styles.saldoLabel}>MONTO A PAGAR</Text>
                <Text style={styles.sheetSaldoValor}>
                  {formatMonto(enDolar ? doc.montoAPagarDolar : doc.montoAPagarLoc)}
                </Text>
              </View>

              <View style={styles.datos}>
                <View style={styles.datosFila}>
                  <Dato label="Hecho" valor={formatFechaDoc(doc.fecha)} />
                  <Dato label="Fecha vencimiento" valor={formatFechaDoc(doc.vence)} />
                </View>
                <View style={styles.datosFila}>
                  <Dato label="Monto documento" valor={formatMonto(enDolar ? doc.montoDocDolar : doc.montoDocLocal)} />
                  <Dato label="Saldo documento" valor={formatMonto(enDolar ? doc.saldoDocDolar : doc.saldoDocLocal)} />
                </View>
                <View style={styles.datosFila}>
                  <Dato label="Vendedor" valor={formatVendedor(doc)} />
                  <Dato label="Abonado en el equipo" valor={formatMonto(enDolar ? doc.abonadoDolar : doc.abonadoLocal)} />
                </View>
              </View>

              <Pressable onPress={onPagar} style={({ pressed }) => [styles.payButton, pressed && styles.pressed]}>
                <Feather name="dollar-sign" size={18} color={colors.onPrimary} />
                <Text style={styles.payText}>Pagar</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// 'YYYY-MM-DD HH:MM:SS' → 'DD/MM/YY HH:MM'.
const formatFechaHora = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(v ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : v ?? '';
};

const FILTROS = [
  { key: 'pendientes', label: 'Pendientes', icon: 'file-text' },
  { key: 'abonos', label: 'Abonos anteriores', icon: 'clock' },
];

// Card de un recibo (abono registrado en el equipo): número, documento, fecha, formas y monto.
function ReciboCard({ recibo, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docCard,
        { borderLeftColor: recibo.cancelado ? colors.success : colors.warning },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.docTitle}>
        <Text style={styles.numero}>{recibo.recibo ? `Recibo ${recibo.recibo}` : 'Recibo sin número'}</Text>
        <View style={styles.venceLine}>
          <Feather name="file-text" size={12} color={colors.textMuted} />
          <Text style={styles.venceText}>Doc. {recibo.documento}</Text>
        </View>
        <View style={styles.venceLine}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={styles.venceText}>{formatFechaHora(recibo.fecha)}</Text>
        </View>
        <Text style={styles.vendedor} numberOfLines={1}>
          {recibo.formas.map((f) => FORMAS_PAGO[f] ?? f).join(' + ')}
        </Text>
      </View>
      <View style={styles.docMontos}>
        <Text style={styles.saldo}>{formatMonto(recibo.monto)}</Text>
        <Text style={[styles.reciboEstado, { color: recibo.cancelado ? colors.success : '#B85F00' }]}>
          {recibo.cancelado ? 'CANCELADO' : 'ABONO'}
        </Text>
        <Text style={styles.reciboEnvio}>
          {!recibo.enviado ? 'Por enviar' : recibo.aplicado ? 'Aplicado' : 'Por aplicar'}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Documentos pendientes del cliente (alCXC_PEN_COB, descargados con Datos > Cargar datos) para el
// cobro elegido (moneda + tipo de pago). Los montos se muestran en la moneda del cobro
// ('Local' | 'Dólar'). Al tocar una card se abre un popup con el detalle y el botón Pagar.
// Filtro "Abonos anteriores": recibos registrados en el equipo para el cliente (también los de
// documentos ya cancelados); al tocar uno se abre el recibo.
// onPagar(doc, { saldoTotal, saldoDocumento, totalAPagar }): abre la pantalla de pago del documento.
// onVerRecibo(idPago): abre el recibo. filtro / onFiltroChange: filtro activo (lo guarda el
// contenedor para que siga elegido al volver del recibo).
export default function CobroDocumentosView({
  cliente,
  ruta,
  moneda,
  tipoPago,
  onBack,
  onPagar,
  onVerRecibo,
  filtro = 'pendientes',
  onFiltroChange,
}) {
  const insets = useSafeAreaInsets();
  const [recibos, setRecibos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([getDocumentosCobro({ cliente: cliente.codigo, ruta }), getRecibosCliente({ cliente: cliente.codigo, ruta })])
      .then(([lista, recibosCliente]) => {
        if (cancelado) return;
        setDocumentos(lista);
        setRecibos(recibosCliente);
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

  const enDolar = moneda === 'Dólar';
  const totalAPagar = useMemo(
    () => documentos.reduce((sum, d) => sum + Number((enDolar ? d.montoAPagarDolar : d.montoAPagarLoc) ?? 0), 0),
    [documentos, enDolar],
  );

  // Solo se renderiza la página actual; el total usa todos los documentos.
  const pagina = useMemo(
    () => documentos.slice((page - 1) * pageSize, page * pageSize),
    [documentos, page, pageSize],
  );

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // Saldo total del cliente: suma de los saldos de todos sus documentos (moneda del cobro).
  const saldoTotal = useMemo(
    () => documentos.reduce((sum, d) => sum + Number((enDolar ? d.saldoDocDolar : d.saldoDocLocal) ?? 0), 0),
    [documentos, enDolar],
  );

  // Total a pagar del documento: su monto a pagar; si no tiene, su saldo.
  const pagar = (doc) => {
    if (!onPagar) {
      Alert.alert('Pagar', 'El registro del pago todavía no está disponible.');
      return;
    }
    const montoAPagar = Number((enDolar ? doc.montoAPagarDolar : doc.montoAPagarLoc) ?? 0);
    const saldoDoc = Number((enDolar ? doc.saldoDocDolar : doc.saldoDocLocal) ?? 0);
    setDetalle(null);
    onPagar(doc, { saldoTotal, saldoDocumento: saldoDoc, totalAPagar: montoAPagar > 0 ? montoAPagar : saldoDoc });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Documentos a cobrar" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {tipoPago} · Moneda {moneda}
          </Text>
          <View style={styles.infoFila}>
            <View>
              <Text style={styles.saldoLabel}>TOTAL A PAGAR</Text>
              <Text style={styles.infoTotal}>{formatMonto(totalAPagar)}</Text>
            </View>
            <View style={styles.chip}>
              <Feather name="file-text" size={12} color={colors.textMuted} />
              <Text style={styles.chipText}>
                {documentos.length} {documentos.length === 1 ? 'documento' : 'documentos'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.filtros}>
          {FILTROS.map((f) => {
            const activo = f.key === filtro;
            const cuenta = f.key === 'abonos' ? recibos.length : documentos.length;
            return (
              <Pressable
                key={f.key}
                onPress={() => onFiltroChange?.(f.key)}
                style={({ pressed }) => [styles.filtro, activo && styles.filtroActivo, pressed && styles.pressed]}
              >
                <Feather name={f.icon} size={14} color={activo ? colors.onPrimary : colors.textMuted} />
                <Text style={[styles.filtroText, activo && styles.filtroTextActivo]} numberOfLines={1}>
                  {f.label} ({cuenta})
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : filtro === 'abonos' ? (
          recibos.length ? (
            recibos.map((r) => <ReciboCard key={r.id} recibo={r} onPress={() => onVerRecibo?.(r.id)} />)
          ) : (
            <View style={styles.empty}>
              <Feather name="inbox" size={32} color={colors.textDisabled} />
              <Text style={styles.emptyText}>El cliente no tiene abonos registrados en este equipo</Text>
            </View>
          )
        ) : documentos.length ? (
          <>
            {pagina.map((d) => (
              <DocumentoCard key={claveDoc(d)} doc={d} enDolar={enDolar} onPress={() => setDetalle(d)} />
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
            <Text style={styles.emptyText}>El cliente no tiene documentos pendientes</Text>
          </View>
        ) : null}
      </ScrollView>

      <DocumentoModal
        doc={detalle}
        enDolar={enDolar}
        onPagar={() => pagar(detalle)}
        onClose={() => setDetalle(null)}
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
  infoFila: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  infoTotal: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
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
  docCard: {
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
  docTitle: { flex: 1 },
  numero: { fontSize: 15, fontWeight: '700', color: colors.text },
  venceLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  venceText: { fontSize: 12, color: colors.textMuted },
  venceVencido: { color: '#A31A13', fontWeight: '600' },
  vendedor: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  docMontos: { alignItems: 'flex-end', flexShrink: 0 },
  abonado: { fontSize: 11, fontWeight: '600', color: colors.success, marginTop: 2 },
  reciboEstado: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  reciboEnvio: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  filtros: { flexDirection: 'row', gap: spacing.sm },
  filtro: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
  },
  filtroActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  filtroText: { fontSize: 13, fontWeight: '700', color: colors.textMuted, flexShrink: 1 },
  filtroTextActivo: { color: colors.onPrimary },
  saldoLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  saldo: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 1 },
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
  badgeVencido: { backgroundColor: '#FDE3E2' },
  badgeAlDia: { backgroundColor: '#E3F2F1' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sheetSaldo: { alignItems: 'center', paddingVertical: spacing.xs },
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
  payButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  payText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  loading: { marginTop: spacing.lg },
  paginacion: { marginTop: spacing.xs },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  error: { fontSize: 12, color: colors.error },
});
