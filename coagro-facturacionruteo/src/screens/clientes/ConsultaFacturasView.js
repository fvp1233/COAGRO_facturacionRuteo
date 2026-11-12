import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import Checkbox from '../../components/ui/Checkbox';
import SearchBar from '../../components/ui/SearchBar';
import HistorialLineasList from '../../components/historial/HistorialLineasList';
import {
  BadgeAnulada,
  ClienteHistorialCard,
  claveFactura,
  Dato,
  DetalleSheet,
  MontosCard,
  TabsHistorial,
  formatFechaHora,
  historialStyles,
} from '../../components/historial/HistorialComun';
import { getHistorialCliente, getLineasFactura } from '../../repositories/historialFacturas';
import { descargarDocumentoPdf } from '../../services/documentoPdf';
import { isNetworkError } from '../../services/api';
import { formatFechaDoc, formatMonto, formatVendedor } from '../../utils/formato';
import { calcularMontos } from '../../utils/montos';
import { normalizar } from '../../utils/text';
import { colors } from '../../theme';

const h = historialStyles;

const SEARCH_MODES = [
  { key: 'numero', label: 'Factura', icon: 'file-text' },
  { key: 'pedido', label: 'Pedido', icon: 'hash' },
];

// Card compacta de una factura: número, fecha, pedido de origen y total. Línea izquierda verde
// (vigente) o roja (anulada); las anuladas se ven atenuadas y con el total tachado.
function FacturaCard({ factura, onPress }) {
  const anulada = factura.anulada;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [h.card, anulada ? styles.cardAnulada : styles.cardVigente, pressed && h.pressed]}
    >
      <View style={[h.cardTexts, anulada && styles.atenuada]}>
        <Text style={h.cardNumero} numberOfLines={1}>{factura.numero}</Text>
        <View style={h.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>{formatFechaDoc(factura.fecha) || '—'}</Text>
        </View>
        {factura.pedido ? (
          <View style={h.cardMeta}>
            <Feather name="shopping-bag" size={12} color={colors.textMuted} />
            <Text style={h.cardMetaText}>Pedido {factura.pedido}</Text>
          </View>
        ) : null}
      </View>
      <View style={h.cardDerecha}>
        <Text style={[h.cardTotal, anulada && styles.tachado]}>{formatMonto(factura.total)}</Text>
        {anulada ? <BadgeAnulada /> : null}
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Registros por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Menú Consultar > Documentos: historial de FACTURAS del ERP del cliente en las rutas de la handheld.
// Solo se muestra lo guardado en el equipo (Datos > Cargar datos); no se consulta en línea.
// Al tocar la card de una factura se abre un popup con sus datos, el botón Imprimir y dos pestañas:
// Detalle (líneas) y Montos (se calculan en el equipo con las líneas: utils/montos). Las anuladas llevan el distintivo ANULADA en la lista y en el detalle.
// Imprimir descarga el PDF del backend (requiere internet) y abre el menú del sistema para
// guardarlo o compartirlo (igual que en Consultar > Cobros).
// facturaInicial ({ compania, numero }): abre directo el popup de esa factura ("Factura no
// encontrada" si no está en el equipo).
export default function ConsultaFacturasView({ cliente, ruta, facturaInicial = null, onBack }) {
  const insets = useSafeAreaInsets();
  const [facturas, setFacturas] = useState([]);
  // ISO de la descarga guardada en el equipo; null = el cliente no tiene historial descargado.
  const [descargado, setDescargado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [imprimiendo, setImprimiendo] = useState(false);
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [texto, setTexto] = useState('');
  const [ocultarAnuladas, setOcultarAnuladas] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);
  const [tab, setTab] = useState('detalle');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  // Historial guardado en el equipo. Con facturaInicial se filtra por su número y se abre su popup.
  useEffect(() => {
    let cancelado = false;
    getHistorialCliente(cliente.codigo)
      .then((cache) => {
        if (cancelado) return;
        setFacturas(cache.facturas);
        setDescargado(cache.descargado);
        if (!facturaInicial) return;
        const f = cache.facturas.find(
          (x) => x.compania === facturaInicial.compania && x.numero === facturaInicial.numero
        );
        if (f) {
          setSearchMode('numero');
          setTexto(f.numero);
          setSeleccionado(claveFactura(f));
        } else {
          setError(`Factura no encontrada: ${facturaInicial.numero}`);
        }
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudo leer el historial de facturas.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
    // Solo al abrir la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imprimir = async () => {
    if (!factura || imprimiendo) return;
    setImprimiendo(true);
    try {
      await descargarDocumentoPdf(factura.numero);
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

  const filtradas = useMemo(() => {
    const q = normalizar(texto);
    return facturas.filter(
      (f) => (!ocultarAnuladas || !f.anulada) && (!q || normalizar(f[searchMode]).includes(q))
    );
  }, [facturas, searchMode, texto, ocultarAnuladas]);

  // Al cambiar la búsqueda se vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [texto, searchMode, ocultarAnuladas]);

  // Solo se renderiza la página actual.
  const pagina = useMemo(() => filtradas.slice((page - 1) * pageSize, page * pageSize), [filtradas, page, pageSize]);

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const anuladas = facturas.filter((f) => f.anulada).length;
  const factura = facturas.find((f) => claveFactura(f) === seleccionado) ?? null;

  // Líneas de la factura seleccionada (se leen de la caché al elegirla).
  useEffect(() => {
    if (!factura) {
      setLineas([]);
      return undefined;
    }
    let cancelado = false;
    setCargandoLineas(true);
    getLineasFactura(factura.compania, factura.numero)
      .then((lista) => {
        if (!cancelado) setLineas(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer las líneas de la factura.');
      })
      .finally(() => {
        if (!cancelado) setCargandoLineas(false);
      });
    return () => {
      cancelado = true;
    };
    // factura sale de `facturas`: se recarga si cambia la selección o llega un historial nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado, facturas]);

  // Montos calculados en el equipo con las líneas de la factura (misma fórmula que en Pedidos).
  const calculo = useMemo(() => calcularMontos(lineas), [lineas]);

  const vacio = cargando
    ? 'Cargando las facturas...'
    : !descargado
      ? 'No hay facturas descargadas para este cliente. Ve a Datos > Cargar datos.'
      : facturas.length
        ? 'Ninguna factura coincide con la búsqueda'
        : 'Este cliente no tiene facturas registradas';

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Historial de facturas" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={h.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard
          cliente={cliente}
          ruta={ruta}
          descargado={descargado}
        />

        {error ? <Text style={h.error}>{error}</Text> : null}

        <SearchBar
          modes={SEARCH_MODES}
          mode={searchMode}
          onModeChange={setSearchMode}
          query={texto}
          onQueryChange={setTexto}
        />
        {anuladas ? (
          <Checkbox
            label={`Ocultar anuladas (${anuladas})`}
            checked={ocultarAnuladas}
            onChange={(v) => {
              setOcultarAnuladas(v);
              if (v && factura?.anulada) setSeleccionado(null);
            }}
          />
        ) : null}

        {filtradas.length ? (
          <View style={h.lista}>
            <Text style={h.contador}>
              {filtradas.length} {filtradas.length === 1 ? 'factura' : 'facturas'}
            </Text>
            {pagina.map((f) => (
              <FacturaCard
                key={claveFactura(f)}
                factura={f}
                onPress={() => {
                  setTab('detalle');
                  setSeleccionado(claveFactura(f));
                }}
              />
            ))}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtradas.length}
              onPageChange={irAPagina}
              onPageSizeChange={(n) => {
                setPageSize(n);
                irAPagina(1);
              }}
            />
          </View>
        ) : (
          <View style={h.empty}>
            {cargando ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="file-text" size={28} color={colors.textDisabled} />
            )}
            <Text style={h.emptyText}>{vacio}</Text>
          </View>
        )}
      </ScrollView>

      {/* Popup de la factura: datos y pestañas Detalle / Montos. */}
      <DetalleSheet
        visible={Boolean(factura)}
        tipo="FACTURA"
        numero={factura?.numero}
        etiquetas={factura?.anulada ? <BadgeAnulada /> : null}
        onClose={() => setSeleccionado(null)}
      >
        {factura ? (
          <>
            <View style={h.sheetTotal}>
              <Text style={h.seccionLabel}>TOTAL DE LA FACTURA</Text>
              <Text style={[h.sheetTotalValor, factura.anulada && styles.tachado]}>
                {formatMonto(factura.total)}
              </Text>
            </View>

            <View style={h.datos}>
              <Dato label="Pedido de origen" value={factura.pedido} />
              <Dato label="Fecha y hora" value={formatFechaHora(factura.fecha)} />
              <Dato label="Condición de pago" value={factura.condicionPago} />
              <Dato label="Vendedor" value={formatVendedor(factura)} />
              {factura.ruta ? <Dato label="Ruta" value={factura.ruta} /> : null}
            </View>

            <Pressable
              onPress={imprimir}
              disabled={imprimiendo}
              style={({ pressed }) => [h.printButton, pressed && h.pressed]}
            >
              {imprimiendo ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Feather name="printer" size={18} color={colors.onPrimary} />
              )}
              <Text style={h.printText}>Imprimir</Text>
            </Pressable>

            <TabsHistorial tab={tab} onChange={setTab} />

            {tab === 'detalle' ? (
              cargandoLineas ? (
                <ActivityIndicator color={colors.primary} style={h.loading} />
              ) : (
                <HistorialLineasList lineas={lineas} />
              )
            ) : (
              cargandoLineas ? (
                <ActivityIndicator color={colors.primary} style={h.loading} />
              ) : lineas.length ? (
                <MontosCard
                  montos={calculo.montos}
                  tachado={factura.anulada}
                  aviso={
                    factura.anulada || calculo.sinMonto ? (
                      <>
                        {factura.anulada ? (
                          <>
                            <BadgeAnulada />
                            <Text style={h.avisoError}>Esta factura está anulada.</Text>
                          </>
                        ) : null}
                        {calculo.sinMonto ? (
                          <Text style={h.avisoText}>
                            {calculo.sinMonto} {calculo.sinMonto === 1 ? 'línea sin monto no incluida' : 'líneas sin monto no incluidas'}
                          </Text>
                        ) : null}
                      </>
                    ) : null
                  }
                />
              ) : (
                <Text style={h.avisoText}>
                  La factura no tiene líneas guardadas — total: {formatMonto(factura.total)}
                </Text>
              )
            )}
          </>
        ) : null}
      </DetalleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  cardVigente: { borderLeftColor: colors.success },
  cardAnulada: { borderLeftColor: colors.primary },
  atenuada: { opacity: 0.5 },
  tachado: { textDecorationLine: 'line-through', opacity: 0.5 },
});
