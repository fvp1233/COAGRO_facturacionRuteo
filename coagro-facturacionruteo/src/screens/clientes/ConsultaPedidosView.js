import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SearchBar from '../../components/ui/SearchBar';
import HistorialPedidosTable, { EtiquetaEstadoPedido, clavePedido } from '../../components/historial/HistorialPedidosTable';
import HistorialLineasTable from '../../components/historial/HistorialLineasTable';
import {
  ClienteHistorialCard,
  Dato,
  EncabezadoDocumento,
  MontosCard,
  TabsHistorial,
  formatDescarga,
  historialStyles,
} from '../../components/historial/HistorialComun';
import { getHistorialPedidos, getLineasPedido } from '../../repositories/historialPedidos';
import { getMontosFacturas } from '../../repositories/historialFacturas';
import { actualizarHistorialPedidos } from '../../services/historialPedidos';
import { actualizarHistorialCliente as actualizarHistorialFacturas } from '../../services/historialFacturas';
import { isNetworkError } from '../../services/api';
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
      <View style={styles.facturasTitulo}>
        <Feather name="file-text" size={14} color={colors.textMuted} />
        <Text style={styles.facturasLabel}>{facturas.length === 1 ? 'Factura' : 'Facturas'}</Text>
      </View>
      {facturas.map((numero) => (
        <Text key={numero} style={styles.facturaNumero} selectable>{numero}</Text>
      ))}
    </View>
  );
}

// Menú Consultar > Pedidos: historial de PEDIDOS del ERP del cliente en las rutas de la handheld
// (/fr/sync/historialPedidos). Al abrir se pide al servidor (requiere internet) y se guarda como
// caché del cliente; sin red se muestra la última caché con su fecha. Al seleccionar un pedido se
// muestran abajo dos pestañas: Detalle (líneas) y Montos. Las facturas tienen su propia vista
// (Menú Consultar > Documentos); aquí solo se muestran sus números.
// Pedido todo facturado (montos null): la pestaña Montos muestra los montos de sus facturas
// (caché de facturas o, si no están, /fr/sync/historialFacturas; solo al abrir esa pestaña).
export default function ConsultaPedidosView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [pedidos, setPedidos] = useState([]);
  // ISO de la última consulta exitosa que se está mostrando; null = nada que mostrar.
  const [descargado, setDescargado] = useState(null);
  const [consultando, setConsultando] = useState(false);
  const enCurso = useRef(false);
  const [error, setError] = useState('');
  // Sin red: se muestra la caché y se avisa de qué fecha es.
  const [aviso, setAviso] = useState('');
  const [texto, setTexto] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [tab, setTab] = useState('detalle');
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);

  const mostrarCache = useCallback(async () => {
    const cache = await getHistorialPedidos(cliente.codigo);
    setPedidos(cache.pedidos);
    setDescargado(cache.descargado);
    return cache;
  }, [cliente.codigo]);

  // Consulta en línea; una sola petición a la vez aunque se toque Actualizar de nuevo.
  const consultar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setConsultando(true);
    setError('');
    setAviso('');
    try {
      await actualizarHistorialPedidos(cliente.codigo);
      await mostrarCache();
    } catch (e) {
      if (isNetworkError(e)) {
        const cache = await mostrarCache().catch(() => null);
        if (cache?.descargado) {
          setAviso(`Sin conexión: se muestran los pedidos descargados el ${formatDescarga(cache.descargado)}.`);
        } else {
          setError('Necesitas conexión para ver los pedidos.');
        }
      } else {
        // El servidor rechazó la consulta (p. ej. el cliente no está en las rutas): no se muestra la caché.
        setPedidos([]);
        setDescargado(null);
        setError(e?.message || 'No se pudo consultar el historial de pedidos.');
      }
    } finally {
      enCurso.current = false;
      setConsultando(false);
    }
  }, [cliente.codigo, mostrarCache]);

  useEffect(() => {
    consultar();
  }, [consultar]);

  const filtrados = useMemo(() => {
    const q = normalizar(texto);
    return q ? pedidos.filter((p) => normalizar(p.numero).includes(q)) : pedidos;
  }, [pedidos, texto]);

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

  // Montos de las facturas de un pedido todo facturado:
  // { clave, cargando, montos, vigentes, anuladas, error }.
  const [deFacturas, setDeFacturas] = useState(null);
  const necesitaFacturas = tab === 'montos' && !!pedido && !pedido.montos && pedido.facturas.length > 0;

  useEffect(() => {
    if (!necesitaFacturas) return undefined;
    const clave = clavePedido(pedido);
    if (deFacturas?.clave === clave && !deFacturas.error) return undefined;
    let cancelado = false;
    setDeFacturas({ clave, cargando: true });
    (async () => {
      let r = await getMontosFacturas(cliente.codigo, pedido.compania, pedido.facturas);
      let error = null;
      // Si alguna factura no está en la caché, se consulta el historial de facturas del cliente.
      if (r.faltan.length) {
        try {
          await actualizarHistorialFacturas(cliente.codigo);
          r = await getMontosFacturas(cliente.codigo, pedido.compania, pedido.facturas);
        } catch (e) {
          error = isNetworkError(e) ? 'Necesitas conexión para ver los montos de la factura.' : e?.message;
        }
      }
      // Si sigue faltando alguna factura no se muestra una suma incompleta.
      const completas = !r.faltan.length;
      if (!cancelado) {
        setDeFacturas({
          clave,
          cargando: false,
          ...r,
          montos: completas ? r.montos : null,
          error: completas ? null : error ?? 'No se encontraron las facturas del pedido.',
        });
      }
    })().catch(() => {
      if (!cancelado) setDeFacturas({ clave, cargando: false, error: 'No se pudieron leer las facturas.' });
    });
    return () => {
      cancelado = true;
    };
    // Solo cuando cambia el pedido mostrado o se abre la pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [necesitaFacturas, seleccionado]);

  const montosFacturas = deFacturas && pedido && deFacturas.clave === clavePedido(pedido) ? deFacturas : null;

  const vacio = consultando
    ? 'Consultando los pedidos...'
    : !descargado
      ? 'Sin pedidos para mostrar'
      : pedidos.length
        ? 'Ningún pedido coincide con la búsqueda'
        : 'Este cliente no tiene pedidos registrados';

  return (
    <View style={[historialStyles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Historial de pedidos" onBack={onBack} />

      <ScrollView contentContainerStyle={historialStyles.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard
          cliente={cliente}
          ruta={ruta}
          descargado={descargado}
          consultando={consultando}
          onActualizar={consultar}
        />

        {aviso ? <Text style={historialStyles.aviso}>{aviso}</Text> : null}
        {error ? <Text style={historialStyles.error}>{error}</Text> : null}

        <SearchBar modes={SEARCH_MODES} mode="numero" query={texto} onQueryChange={setTexto} />

        <HistorialPedidosTable
          pedidos={filtrados}
          selectedKey={seleccionado}
          onSelect={(p) => setSeleccionado(clavePedido(p))}
          emptyText={vacio}
        />

        {pedido ? (
          <View style={historialStyles.detalle}>
            <EncabezadoDocumento
              tipo="Pedido"
              numero={pedido.numero}
              etiquetas={<EtiquetaEstadoPedido estado={pedido.estado} />}
            >
              <Dato label="Fecha" value={formatFechaDoc(pedido.fecha)} />
              <Dato label="Total del pedido" value={formatMonto(pedido.total)} />
              {pedido.ruta ? <Dato label="Ruta" value={pedido.ruta} /> : null}
            </EncabezadoDocumento>

            <FacturasDelPedido facturas={pedido.facturas} />

            <TabsHistorial tab={tab} onChange={setTab} />

            {tab === 'detalle' ? (
              cargandoLineas ? (
                <ActivityIndicator color={ACCENT} style={historialStyles.loading} />
              ) : (
                <HistorialLineasTable lineas={lineas} />
              )
            ) : pedido.montos ? (
              <MontosCard
                montos={pedido.montos}
                aviso={
                  pedido.hayFacturadas ? (
                    <Text style={historialStyles.avisoText}>Montos de líneas pendientes</Text>
                  ) : null
                }
              />
            ) : montosFacturas?.cargando ? (
              <ActivityIndicator color={ACCENT} style={historialStyles.loading} />
            ) : montosFacturas?.montos ? (
              // Todo facturado: montos de sus facturas vigentes (los mismos de Documentos).
              <MontosCard
                montos={montosFacturas.montos}
                aviso={
                  <>
                    <EtiquetaEstadoPedido estado="F" />
                    <Text style={historialStyles.avisoText}>
                      {montosFacturas.vigentes.length === 1
                        ? `Montos de la factura ${montosFacturas.vigentes[0]}`
                        : `Suma de ${montosFacturas.vigentes.length} facturas`}
                      {montosFacturas.anuladas.length ? ` (sin ${montosFacturas.anuladas.length} anulada${montosFacturas.anuladas.length === 1 ? '' : 's'})` : ''}
                    </Text>
                  </>
                }
              />
            ) : (
              // montos null y sin montos de facturas: solo el total del pedido.
              <View style={styles.facturado}>
                <EtiquetaEstadoPedido estado="F" />
                <Text style={styles.facturadoText}>
                  Pedido facturado — total del pedido: <Text style={styles.facturadoTotal}>{formatMonto(pedido.total)}</Text>
                </Text>
                {montosFacturas?.error ? <Text style={historialStyles.error}>{montosFacturas.error}</Text> : null}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  facturas: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  facturasTitulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  facturasLabel: { fontSize: 11, color: colors.textMuted },
  facturaNumero: { fontSize: 13, fontWeight: '600', color: colors.text },
  facturado: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  facturadoText: { fontSize: 14, color: colors.text },
  facturadoTotal: { fontWeight: '800' },
});
