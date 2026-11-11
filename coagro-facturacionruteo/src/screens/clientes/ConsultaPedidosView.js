import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import SearchBar from '../../components/ui/SearchBar';
import HistorialLineasList from '../../components/historial/HistorialLineasList';
import {
  ClienteHistorialCard,
  clavePedido,
  Dato,
  DetalleSheet,
  EtiquetaEstadoPedido,
  MontosCard,
  TabsHistorial,
  historialStyles,
} from '../../components/historial/HistorialComun';
import { getHistorialPedidos, getLineasPedido } from '../../repositories/historialPedidos';
import { calcularMontos } from '../../utils/montos';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;

const SEARCH_MODES = [{ key: 'numero', label: 'Pedido', icon: 'hash' }];

// Números de factura que salieron del pedido (solo referencia; las facturas se consultan en
// Menú Consultar > Documentos).
function FacturasDelPedido({ facturas }) {
  if (!facturas.length) return null;
  return (
    <View style={styles.facturas}>
      <Text style={historialStyles.seccionLabel}>{facturas.length === 1 ? 'FACTURA' : 'FACTURAS'}</Text>
      <View style={styles.facturasChips}>
        {facturas.map((numero) => (
          <View key={numero} style={styles.facturaChip}>
            <Feather name="file-text" size={12} color={colors.textMuted} />
            <Text style={styles.facturaNumero} selectable>{numero}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const esFacturado = (p) => p.estado === 'F';

// Card compacta de un pedido: número, fecha, facturas y total. Línea izquierda = estado
// (verde facturado, naranja pendiente).
function PedidoCard({ pedido, onPress }) {
  const fact = esFacturado(pedido);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [historialStyles.card, fact ? styles.cardFacturado : styles.cardPendiente, pressed && historialStyles.pressed]}
    >
      <View style={historialStyles.cardTexts}>
        <Text style={historialStyles.cardNumero} numberOfLines={1}>{pedido.numero}</Text>
        <View style={historialStyles.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={historialStyles.cardMetaText}>{formatFechaDoc(pedido.fecha) || '—'}</Text>
          {pedido.facturas.length ? (
            <>
              <Text style={historialStyles.cardMetaText}>·</Text>
              <Feather name="file-text" size={12} color={colors.textMuted} />
              <Text style={historialStyles.cardMetaText}>
                {pedido.facturas.length} {pedido.facturas.length === 1 ? 'factura' : 'facturas'}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <View style={historialStyles.cardDerecha}>
        <Text style={historialStyles.cardTotal}>{formatMonto(pedido.total)}</Text>
        <Text style={[historialStyles.cardEstado, fact ? styles.textoFacturado : styles.textoPendiente]}>
          {fact ? 'FACTURADO' : 'PENDIENTE'}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Registros por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Menú Consultar > Pedidos: historial de PEDIDOS del ERP del cliente en las rutas de la handheld
// (se descarga en Datos > Cargar datos). Solo se muestra lo guardado en el equipo (offline); no se
// consulta en línea. Al tocar la card de un pedido se
// abre un popup con su encabezado, sus facturas y dos pestañas: Detalle (líneas) y Montos. Las facturas tienen su propia vista
// (Menú Consultar > Documentos); aquí solo se muestran sus números.
// La pestaña Montos se calcula en el equipo con las líneas del pedido (utils/montos, misma
// fórmula del backend): no necesita internet.
export default function ConsultaPedidosView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [pedidos, setPedidos] = useState([]);
  // ISO de la descarga guardada en el equipo; null = el cliente no tiene historial descargado.
  const [descargado, setDescargado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);
  const [tab, setTab] = useState('detalle');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  // Historial guardado en el equipo (Datos > Cargar datos).
  useEffect(() => {
    let cancelado = false;
    getHistorialPedidos(cliente.codigo)
      .then((cache) => {
        if (cancelado) return;
        setPedidos(cache.pedidos);
        setDescargado(cache.descargado);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudo leer el historial de pedidos.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo]);

  const filtrados = useMemo(() => {
    const q = normalizar(texto);
    return q ? pedidos.filter((p) => normalizar(p.numero).includes(q)) : pedidos;
  }, [pedidos, texto]);

  // Al cambiar la búsqueda se vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [texto]);

  // Solo se renderiza la página actual.
  const pagina = useMemo(() => filtrados.slice((page - 1) * pageSize, page * pageSize), [filtrados, page, pageSize]);

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const pedido = pedidos.find((p) => clavePedido(p) === seleccionado) ?? null;

  // Líneas del pedido seleccionado (se leen de la caché al elegirlo).
  useEffect(() => {
    if (!pedido) {
      setLineas([]);
      return undefined;
    }
    let cancelado = false;
    setCargandoLineas(true);
    getLineasPedido(pedido.compania, pedido.numero)
      .then((lista) => {
        if (!cancelado) setLineas(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer las líneas del pedido.');
      })
      .finally(() => {
        if (!cancelado) setCargandoLineas(false);
      });
    return () => {
      cancelado = true;
    };
    // pedido sale de `pedidos`: se recarga si cambia la selección o llega un historial nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, pedidos]);

  // Montos calculados en el equipo con las líneas del pedido (misma fórmula del backend).
  const calculo = useMemo(() => calcularMontos(lineas), [lineas]);

  const vacio = cargando
    ? 'Cargando los pedidos...'
    : !descargado
      ? 'No hay pedidos descargados para este cliente. Ve a Datos > Cargar datos.'
      : pedidos.length
        ? 'Ningún pedido coincide con la búsqueda'
        : 'Este cliente no tiene pedidos registrados';

  return (
    <View style={[historialStyles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Historial de pedidos" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={historialStyles.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard
          cliente={cliente}
          ruta={ruta}
          descargado={descargado}
        />

        {error ? <Text style={historialStyles.error}>{error}</Text> : null}

        <SearchBar modes={SEARCH_MODES} mode="numero" query={texto} onQueryChange={setTexto} />

        {filtrados.length ? (
          <View style={historialStyles.lista}>
            <Text style={historialStyles.contador}>
              {filtrados.length} {filtrados.length === 1 ? 'pedido' : 'pedidos'}
            </Text>
            {pagina.map((p) => (
              <PedidoCard
                key={clavePedido(p)}
                pedido={p}
                onPress={() => {
                  setTab('detalle');
                  setSeleccionado(clavePedido(p));
                }}
              />
            ))}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtrados.length}
              onPageChange={irAPagina}
              onPageSizeChange={(n) => {
                setPageSize(n);
                irAPagina(1);
              }}
            />
          </View>
        ) : (
          <View style={historialStyles.empty}>
            {cargando ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <Feather name="shopping-bag" size={28} color={colors.textDisabled} />
            )}
            <Text style={historialStyles.emptyText}>{vacio}</Text>
          </View>
        )}
      </ScrollView>

      {/* Popup del pedido: encabezado, facturas y pestañas Detalle / Montos. */}
      <DetalleSheet
        visible={Boolean(pedido)}
        tipo="PEDIDO"
        numero={pedido?.numero}
        etiquetas={pedido ? <EtiquetaEstadoPedido estado={pedido.estado} /> : null}
        onClose={() => setSeleccionado(null)}
      >
        {pedido ? (
          <>
            <View style={historialStyles.sheetTotal}>
              <Text style={historialStyles.seccionLabel}>TOTAL DEL PEDIDO</Text>
              <Text style={historialStyles.sheetTotalValor}>{formatMonto(pedido.total)}</Text>
            </View>

            <View style={historialStyles.datos}>
              <Dato label="Fecha" value={formatFechaDoc(pedido.fecha)} />
              {pedido.ruta ? <Dato label="Ruta" value={pedido.ruta} /> : null}
            </View>

            <FacturasDelPedido facturas={pedido.facturas} />

            <TabsHistorial tab={tab} onChange={setTab} />

            {tab === 'detalle' ? (
              cargandoLineas ? (
                <ActivityIndicator color={ACCENT} style={historialStyles.loading} />
              ) : (
                <HistorialLineasList lineas={lineas} />
              )
            ) : cargandoLineas ? (
              <ActivityIndicator color={ACCENT} style={historialStyles.loading} />
            ) : lineas.length ? (
              <MontosCard
                montos={calculo.montos}
                aviso={
                  calculo.sinMonto ? (
                    <Text style={historialStyles.avisoText}>
                      {calculo.sinMonto} {calculo.sinMonto === 1 ? 'línea sin monto no incluida' : 'líneas sin monto no incluidas'}
                    </Text>
                  ) : null
                }
              />
            ) : (
              // Sin líneas guardadas: solo el total del pedido.
              <View style={styles.facturado}>
                <Text style={styles.facturadoText}>
                  El pedido no tiene líneas guardadas — total del pedido:{' '}
                  <Text style={styles.facturadoTotal}>{formatMonto(pedido.total)}</Text>
                </Text>
              </View>
            )}
          </>
        ) : null}
      </DetalleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  cardFacturado: { borderLeftColor: colors.success },
  cardPendiente: { borderLeftColor: colors.warning },
  textoFacturado: { color: colors.success },
  textoPendiente: { color: '#B85F00' },
  facturas: { gap: spacing.xs + 2 },
  facturasChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  facturaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  facturaNumero: { fontSize: 13, fontWeight: '600', color: colors.text },
  facturado: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  facturadoText: { fontSize: 14, color: colors.text },
  facturadoTotal: { fontWeight: '800' },
});
