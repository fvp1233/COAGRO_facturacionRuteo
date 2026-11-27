import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import HistorialLineasList from '../../components/historial/HistorialLineasList';
import {
  ClienteHistorialCard,
  Dato,
  DetalleSheet,
  Etiqueta,
  formatFechaHora,
  historialStyles,
} from '../../components/historial/HistorialComun';
import {
  descartarNotaCredito,
  getLineasNotaCredito,
  getNotaCreditoParaCorregir,
  getNotasCreditoCliente,
  IND_DEV,
} from '../../repositories/notasCredito';
import NotaCreditoCapturaView from './NotaCreditoCapturaView';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;
const PAGE_SIZE = 10;

// Estado de la NC: texto, tono de la etiqueta y color de la línea izquierda de la card.
const ESTADOS = {
  pendiente: { texto: 'SIN ENVIAR', tono: 'ambar', color: colors.warning },
  error: { texto: 'CON ERROR', tono: 'rojo', color: colors.error },
  enviada: { texto: 'PENDIENTE DE PROCESAR', tono: 'ambar', color: colors.primary },
  procesada: { texto: 'PROCESADA', tono: 'verde', color: colors.success },
};
const IND_DEV_TEXTO = {
  [IND_DEV.bueno]: 'Devolución (buen estado)',
  [IND_DEV.malo]: 'Devolución (mal estado)',
  [IND_DEV.precio]: 'Solo monto',
};
const claveNc = (n) => `${n.compania}|${n.ruta}|${n.numero}`;

function NotaCard({ nota, onPress }) {
  const e = ESTADOS[nota.estado];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [h.card, { borderLeftColor: e.color }, pressed && h.pressed]}>
      <View style={h.cardTexts}>
        <Text style={h.cardNumero} numberOfLines={1}>{nota.numero}</Text>
        <View style={h.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>{formatFechaDoc(nota.fecha) || '—'}</Text>
          <Text style={h.cardMetaText}>· CCF {nota.ccf || '—'}</Text>
        </View>
        {nota.motivoDescripcion ? <Text style={h.cardMetaText}>{nota.motivoDescripcion}</Text> : null}
      </View>
      <View style={h.cardDerecha}>
        <Text style={h.cardTotal}>{formatMonto(nota.montos.total)}</Text>
        <Etiqueta texto={e.texto} tono={e.tono} />
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Menú Consultar > Notas de crédito (y pestaña Consulta): las NC del cliente que están en el equipo
// (las creadas aquí y las descargadas en Datos > Cargar datos: pendientes de procesar y de los últimos
// 30 días), con su estado de envío y de proceso en oficina. Al tocar una se ven sus datos y líneas.
// Las que siguen SIN ENVIAR (también las rechazadas por el servidor, CON ERROR) se pueden corregir
// (misma captura, mismo número) o descartar.
export default function ConsultaNotasCreditoView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [notas, setNotas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionada, setSeleccionada] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // NC que se está corrigiendo: { ccf, motivo, razon, observaciones, capturas, nota, errorEnvio }.
  const [correccion, setCorreccion] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(
    () =>
      getNotasCreditoCliente(cliente.codigo)
        .then(setNotas)
        .catch((e) => setError(e?.message || 'No se pudieron leer las notas de crédito.')),
    [cliente.codigo]
  );

  useEffect(() => {
    setCargando(true);
    leer().finally(() => setCargando(false));
  }, [leer]);

  const nota = notas.find((n) => claveNc(n) === seleccionada) ?? null;
  const editable = nota && (nota.estado === 'pendiente' || nota.estado === 'error');

  const corregir = async () => {
    if (!nota || ocupado) return;
    setOcupado(true);
    try {
      const datos = await getNotaCreditoParaCorregir(nota.compania, nota.ruta, nota.numero);
      setCorreccion({
        ...datos,
        nota: { compania: nota.compania, ruta: nota.ruta, numero: nota.numero },
        errorEnvio: nota.errorEnvio,
      });
    } catch (e) {
      Alert.alert('No se puede corregir', e?.message || 'No se pudo leer la nota de crédito.');
    } finally {
      setOcupado(false);
    }
  };

  const descartar = () => {
    if (!nota || ocupado) return;
    Alert.alert(
      'Descartar nota de crédito',
      `¿Seguro que deseas borrar la nota ${nota.numero} del equipo? No se enviará y su número queda sin usar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            setOcupado(true);
            try {
              await descartarNotaCredito(nota.compania, nota.ruta, nota.numero);
              setSeleccionada(null);
              await leer();
            } catch (e) {
              Alert.alert('No se pudo descartar', e?.message || 'Error al borrar de la base local.');
            } finally {
              setOcupado(false);
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (!nota) {
      setLineas([]);
      return undefined;
    }
    let cancelado = false;
    setCargandoLineas(true);
    getLineasNotaCredito(nota.compania, nota.ruta, nota.numero)
      .then((lista) => {
        if (!cancelado) setLineas(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer las líneas de la nota de crédito.');
      })
      .finally(() => {
        if (!cancelado) setCargandoLineas(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionada]);

  const pagina = useMemo(() => notas.slice((page - 1) * pageSize, page * pageSize), [notas, page, pageSize]);
  const tipos = [...new Set(lineas.map((l) => IND_DEV_TEXTO[l.indDev] ?? l.indDev).filter(Boolean))].join(', ');

  if (correccion) {
    return (
      <NotaCreditoCapturaView
        cliente={cliente}
        ruta={correccion.nota.ruta}
        ccf={correccion.ccf}
        correccion={correccion}
        onBack={() => setCorreccion(null)}
        onGuardada={async (numero) => {
          setCorreccion(null);
          setSeleccionada(null);
          await leer();
          Alert.alert(
            'Nota de crédito corregida',
            `Se guardó la corrección de la nota ${numero}. Envíala en Datos > Enviar Datos.`
          );
        }}
      />
    );
  }

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Notas de crédito del cliente y su estado. Las que siguen sin enviar o tienen error se pueden corregir o descartar.'} title="Notas de crédito" onBack={onBack} />

      <ScrollView contentContainerStyle={h.content}>
        <ClienteHistorialCard cliente={cliente} ruta={ruta} />
        {error ? <Text style={h.error}>{error}</Text> : null}

        {notas.length ? (
          <View style={h.lista}>
            <Text style={h.contador}>
              {notas.length} {notas.length === 1 ? 'nota de crédito' : 'notas de crédito'}
            </Text>
            {pagina.map((n) => (
              <NotaCard key={claveNc(n)} nota={n} onPress={() => setSeleccionada(claveNc(n))} />
            ))}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={notas.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </View>
        ) : (
          <View style={h.empty}>
            {cargando ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="file-minus" size={28} color={colors.textDisabled} />
            )}
            <Text style={h.emptyText}>
              {cargando ? 'Cargando las notas de crédito...' : 'Este cliente no tiene notas de crédito en el equipo'}
            </Text>
          </View>
        )}
      </ScrollView>

      <DetalleSheet
        visible={Boolean(nota)}
        tipo="NOTA DE CRÉDITO"
        numero={nota?.numero}
        etiquetas={nota ? <Etiqueta texto={ESTADOS[nota.estado].texto} tono={ESTADOS[nota.estado].tono} /> : null}
        onClose={() => setSeleccionada(null)}
      >
        {nota ? (
          <>
            <View style={h.sheetTotal}>
              <Text style={h.seccionLabel}>TOTAL ACREDITADO</Text>
              <Text style={h.sheetTotalValor}>{formatMonto(nota.montos.total)}</Text>
            </View>
            {nota.errorEnvio ? <Text style={h.avisoError}>{nota.errorEnvio}</Text> : null}
            {editable ? (
              <View style={styles.acciones}>
                <Pressable
                  onPress={corregir}
                  disabled={ocupado}
                  style={({ pressed }) => [styles.accion, styles.accionCorregir, (pressed || ocupado) && styles.pressed]}
                >
                  <Feather name="edit-2" size={16} color={colors.onPrimary} />
                  <Text style={styles.accionCorregirText}>Corregir</Text>
                </Pressable>
                <Pressable
                  onPress={descartar}
                  disabled={ocupado}
                  style={({ pressed }) => [styles.accion, styles.accionDescartar, (pressed || ocupado) && styles.pressed]}
                >
                  <Feather name="trash-2" size={16} color={colors.error} />
                  <Text style={styles.accionDescartarText}>Descartar</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={h.datos}>
              <Dato label="CCF que afecta" value={nota.ccf} />
              <Dato label="NCF del CCF" value={nota.ncfCcf} />
              <Dato label="Fecha y hora" value={formatFechaHora(nota.fecha)} />
              <Dato label="Motivo" value={nota.motivoDescripcion} />
              <Dato label="Razón" value={nota.razon} />
              {nota.observaciones ? <Dato label="Observaciones" value={nota.observaciones} /> : null}
              {tipos ? <Dato label="Tipo" value={tipos} /> : null}
              <Dato label="Sin IVA" value={formatMonto(nota.montos.sinIva)} />
              <Dato label="Impuestos" value={formatMonto(nota.montos.iva + nota.montos.oi)} />
              <Dato label="Ruta" value={nota.ruta} />
            </View>
            {cargandoLineas ? (
              <ActivityIndicator color={colors.primary} style={h.loading} />
            ) : (
              <HistorialLineasList lineas={lineas} />
            )}
          </>
        ) : null}
      </DetalleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  acciones: { flexDirection: 'row', gap: spacing.sm },
  accion: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  accionCorregir: { backgroundColor: colors.primary },
  accionCorregirText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
  accionDescartar: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.background },
  accionDescartarText: { fontSize: 14, fontWeight: '700', color: colors.error },
  pressed: { opacity: 0.7 },
});

