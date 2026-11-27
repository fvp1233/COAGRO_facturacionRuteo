import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import { ClienteHistorialCard, historialStyles } from '../../components/historial/HistorialComun';
import { getCcfCliente, getDatosNotaCredito, motivoSinNotaCredito } from '../../repositories/notasCredito';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;
const PAGE_SIZE = 10;

function CcfCard({ ccf, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [h.card, styles.card, pressed && h.pressed]}>
      <View style={h.cardTexts}>
        <Text style={h.cardNumero} numberOfLines={1} selectable>{ccf.numero}</Text>
        <View style={h.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>{formatFechaDoc(ccf.fecha) || '—'}</Text>
          {ccf.notas ? (
            <Text style={h.cardMetaText}>
              · {ccf.notas} {ccf.notas === 1 ? 'nota de crédito' : 'notas de crédito'}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={h.cardDerecha}>
        <Text style={h.cardTotal}>{formatMonto(ccf.total)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Validar > Notas de crédito: paso 1, elegir el Comprobante de Crédito Fiscal (CCF) que se afecta.
// Los CCF salen del historial de facturas del equipo (Datos >
// Cargar datos): no anulados y con NUM_FAC de Hacienda tipo 03 ('DTE-03-'). onElegir(ccf) abre la captura.
export default function NotaCreditoView({ cliente, ruta, onBack, onElegir }) {
  const insets = useSafeAreaInsets();
  const [cargando, setCargando] = useState(true);
  const [bloqueo, setBloqueo] = useState(null);
  const [ccfs, setCcfs] = useState([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const datos = await getDatosNotaCredito(cliente.codigo, ruta);
        const motivo = motivoSinNotaCredito(datos, ruta);
        if (cancelado) return;
        setBloqueo(motivo);
        if (!motivo) {
          const lista = await getCcfCliente(cliente.codigo);
          if (!cancelado) setCcfs(lista);
        }
      } catch (e) {
        if (!cancelado) setError(e?.message || 'No se pudo leer la base local.');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const pagina = useMemo(() => ccfs.slice((page - 1) * pageSize, page * pageSize), [ccfs, page, pageSize]);

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Elige el Comprobante de Crédito Fiscal (DTE-03) sobre el que harás la nota de crédito.'} title="Nota de crédito" onBack={onBack} />

      <ScrollView contentContainerStyle={h.content}>
        <ClienteHistorialCard cliente={cliente} ruta={ruta} />

        {error ? <Text style={h.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={h.loading} />
        ) : bloqueo ? (
          <View style={styles.bloqueo}>
            <Feather name="alert-circle" size={22} color={colors.error} />
            <Text style={styles.bloqueoText}>{bloqueo}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.ayuda}>
              Elige el Comprobante de Crédito Fiscal (CCF) que afecta la nota de crédito.
            </Text>
            {ccfs.length ? (
              <View style={h.lista}>
                <Text style={h.contador}>
                  {ccfs.length} {ccfs.length === 1 ? 'crédito fiscal' : 'créditos fiscales'}
                </Text>
                {pagina.map((c) => (
                  <CcfCard key={`${c.compania}|${c.numero}`} ccf={c} onPress={() => onElegir?.(c)} />
                ))}
                <Pagination
                  page={page}
                  pageSize={pageSize}
                  total={ccfs.length}
                  onPageChange={setPage}
                  onPageSizeChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
              </View>
            ) : (
              <View style={h.empty}>
                <Feather name="file-text" size={28} color={colors.textDisabled} />
                <Text style={h.emptyText}>
                  El cliente no tiene Comprobantes de Crédito Fiscal (DTE-03) vigentes en el historial del equipo.
                  Si es consumidor final (solo facturas DTE-01), no se le puede hacer nota de crédito. Si debería
                  tener alguno, ve a Datos &gt; Cargar datos para actualizar el historial.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderLeftColor: colors.success },
  ayuda: { fontSize: 13, color: colors.textMuted },
  bloqueo: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bloqueoText: { flex: 1, fontSize: 14, color: colors.error },
});
