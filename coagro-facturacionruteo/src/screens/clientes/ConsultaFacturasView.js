import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import SearchBar from '../../components/ui/SearchBar';
import HistorialFacturasTable, { BadgeAnulada, claveFactura } from '../../components/historial/HistorialFacturasTable';
import HistorialLineasTable from '../../components/historial/HistorialLineasTable';
import {
  ClienteHistorialCard,
  Dato,
  EncabezadoDocumento,
  MontosCard,
  TabsHistorial,
  formatDescarga,
  formatFechaHora,
  historialStyles as styles,
} from '../../components/historial/HistorialComun';
import { getHistorialCliente, getLineasFactura } from '../../repositories/historialFacturas';
import { actualizarHistorialCliente } from '../../services/historialFacturas';
import { isNetworkError } from '../../services/api';
import { formatVendedor } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors } from '../../theme';

const SEARCH_MODES = [
  { key: 'numero', label: 'Factura', icon: 'file-text' },
  { key: 'pedido', label: 'Pedido', icon: 'hash' },
];

// Menú Consultar > Documentos: historial de FACTURAS del ERP del cliente en las rutas de la handheld
// (se descarga en Datos > Cargar datos). Al abrir se muestra lo guardado en el equipo; Actualizar
// (o un cliente sin nada guardado) consulta /fr/sync/historialFacturas y reemplaza su caché; sin red
// se muestra la última caché con su fecha.
// Al seleccionar una factura se muestran abajo dos pestañas: Detalle (líneas) y Montos. Las anuladas
// llevan el distintivo ANULADA en la lista y en el detalle.
// facturaInicial ({ compania, numero }): abre directo el detalle de esa factura. Si ya está en la
// caché no se consulta al servidor; si no, se consulta y se busca ("Factura no encontrada" si no está).
export default function ConsultaFacturasView({ cliente, ruta, facturaInicial = null, onBack }) {
  const insets = useSafeAreaInsets();
  const [facturas, setFacturas] = useState([]);
  // ISO de la última consulta exitosa que se está mostrando; null = nada que mostrar.
  const [descargado, setDescargado] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const enCurso = useRef(false);
  const [error, setError] = useState('');
  // Sin red: se muestra la caché y se avisa de qué fecha es.
  const [aviso, setAviso] = useState('');
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [texto, setTexto] = useState('');
  const [ocultarAnuladas, setOcultarAnuladas] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [tab, setTab] = useState('detalle');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  const mostrarCache = useCallback(async () => {
    const cache = await getHistorialCliente(cliente.codigo);
    setFacturas(cache.facturas);
    setDescargado(cache.descargado);
    return cache;
  }, [cliente.codigo]);

  // Consulta en línea; una sola petición a la vez aunque se toque Actualizar de nuevo.
  // Devuelve las facturas guardadas si la consulta salió bien; null si falló.
  const consultar = useCallback(async () => {
    if (enCurso.current) return null;
    enCurso.current = true;
    setConsultando(true);
    setError('');
    setAviso('');
    try {
      await actualizarHistorialCliente(cliente.codigo);
      return (await mostrarCache()).facturas;
    } catch (e) {
      if (isNetworkError(e)) {
        const cache = await mostrarCache().catch(() => null);
        if (cache?.descargado) {
          setAviso(`Sin conexión: se muestra el historial descargado el ${formatDescarga(cache.descargado)}.`);
        } else {
          setError('Necesitas conexión para ver el historial.');
        }
      } else {
        // El servidor rechazó la consulta (p. ej. el cliente no está en las rutas): no se muestra la caché.
        setFacturas([]);
        setDescargado(null);
        setError(e?.message || 'No se pudo consultar el historial.');
      }
      return null;
    } finally {
      enCurso.current = false;
      setConsultando(false);
    }
  }, [cliente.codigo, mostrarCache]);

  useEffect(() => {
    // Al abrir se muestra lo guardado en el equipo (Cargar datos); solo se consulta en línea si este
    // cliente no tiene nada guardado. El botón Actualizar consulta en línea cuando se quiera.
    if (!facturaInicial) {
      mostrarCache()
        .then((cache) => {
          if (!cache.descargado) consultar();
        })
        .catch(() => consultar());
      return;
    }
    // Abrir directo una factura: la lista queda filtrada por su número y se selecciona.
    const buscar = (lista) =>
      lista?.find((f) => f.compania === facturaInicial.compania && f.numero === facturaInicial.numero);
    const abrir = (f) => {
      setSearchMode('numero');
      setTexto(f.numero);
      setSeleccionado(claveFactura(f));
    };
    (async () => {
      const cache = await mostrarCache().catch(() => null);
      const enCache = buscar(cache?.facturas);
      if (enCache) {
        abrir(enCache);
        return;
      }
      const lista = await consultar();
      if (!lista) return;
      const encontrada = buscar(lista);
      if (encontrada) abrir(encontrada);
      else setError(`Factura no encontrada: ${facturaInicial.numero}`);
    })();
    // Solo al abrir la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtradas = useMemo(() => {
    const q = normalizar(texto);
    return facturas.filter(
      (f) => (!ocultarAnuladas || !f.anulada) && (!q || normalizar(f[searchMode]).includes(q))
    );
  }, [facturas, searchMode, texto, ocultarAnuladas]);

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

  const vacio = consultando
    ? 'Consultando el historial...'
    : !descargado
      ? 'Sin historial para mostrar'
      : facturas.length
        ? 'Ninguna factura coincide con la búsqueda'
        : 'Este cliente no tiene facturas registradas';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Historial de facturas" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard
          cliente={cliente}
          ruta={ruta}
          descargado={descargado}
          consultando={consultando}
          onActualizar={consultar}
        />

        {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

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

        <HistorialFacturasTable
          facturas={filtradas}
          selectedKey={seleccionado}
          onSelect={(f) => setSeleccionado(claveFactura(f))}
          highlightKey={searchMode}
          emptyText={vacio}
        />

        {factura ? (
          <View style={styles.detalle}>
            <EncabezadoDocumento
              tipo="Factura"
              numero={factura.numero}
              etiquetas={factura.anulada ? <BadgeAnulada /> : null}
            >
              <Dato label="Pedido de origen" value={factura.pedido} />
              <Dato label="Fecha y hora" value={formatFechaHora(factura.fecha)} />
              <Dato label="Condición de pago" value={factura.condicionPago} />
              <Dato label="Vendedor" value={formatVendedor(factura)} />
              {factura.ruta ? <Dato label="Ruta" value={factura.ruta} /> : null}
            </EncabezadoDocumento>

            <TabsHistorial tab={tab} onChange={setTab} />

            {tab === 'detalle' ? (
              cargandoLineas ? (
                <ActivityIndicator color={colors.primary} style={styles.loading} />
              ) : (
                <HistorialLineasTable lineas={lineas} />
              )
            ) : (
              <MontosCard
                montos={factura.montos}
                tachado={factura.anulada}
                aviso={
                  factura.anulada ? (
                    <>
                      <BadgeAnulada />
                      <Text style={styles.avisoError}>Esta factura está anulada.</Text>
                    </>
                  ) : null
                }
              />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
