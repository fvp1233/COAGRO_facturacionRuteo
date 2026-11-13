import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import Checkbox from '../../components/ui/Checkbox';
import SearchBar from '../../components/ui/SearchBar';
import PromocionesLista from '../../components/promociones/PromocionesLista';
import {
  ClienteHistorialCard,
  Dato,
  DetalleSheet,
  Etiqueta,
  TabsHistorial,
  historialStyles,
} from '../../components/historial/HistorialComun';
import { getDescuentosCliente, TIPO_PORCENTAJE, VIGENCIA } from '../../repositories/descuentos';
import { formatCantidad, formatFechaDoc, formatMonto, formatPorcentaje } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors } from '../../theme';

const h = historialStyles;

const TABS = [
  { key: 'descuentos', label: 'Descuentos' },
  { key: 'promociones', label: 'Promociones' },
];

const SEARCH_MODES = [
  { key: 'descripcion', label: 'Artículo', icon: 'package' },
  { key: 'articulo', label: 'Código', icon: 'hash' },
];

// Registros por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

// Etiqueta y color (línea izquierda) de cada vigencia.
const VIGENCIAS = {
  [VIGENCIA.vigente]: { texto: 'Vigente', tono: 'verde', color: colors.success },
  [VIGENCIA.proximo]: { texto: 'Próximo', tono: 'ambar', color: colors.warning },
  [VIGENCIA.vencido]: { texto: 'Vencido', tono: 'rojo', color: colors.textDisabled },
};

const clave = (d) => `${d.compania}|${d.articulo}|${d.cantMin}|${d.cantMax}|${d.fechaInicio}|${d.fechaFin}`;

// Valor del descuento según TIPO: 'P' = porcentaje; otro = monto.
const valorDescuento = (d) => (d.tipo === TIPO_PORCENTAJE ? formatPorcentaje(d.monto) : formatMonto(d.monto));

// Card de un descuento: artículo, rango de cantidades, vigencia y valor del descuento. Al tocarla se
// abre el popup para hacer un pedido o una cotización con ese artículo.
function DescuentoCard({ descuento: d, onPress }) {
  const v = VIGENCIAS[d.vigencia];
  const vencido = d.vigencia === VIGENCIA.vencido;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [h.card, { borderLeftColor: v.color }, pressed && h.pressed]}
    >
      <View style={[h.cardTexts, vencido && styles.atenuada]}>
        <Text style={h.cardNumero} numberOfLines={2}>{d.descripcion || d.articulo}</Text>
        {d.descripcion ? (
          <View style={h.cardMeta}>
            <Feather name="hash" size={12} color={colors.textMuted} />
            <Text style={h.cardMetaText}>{d.articulo}</Text>
          </View>
        ) : null}
        <View style={h.cardMeta}>
          <Feather name="layers" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>
            De {formatCantidad(d.cantMin)} a {formatCantidad(d.cantMax)} unidades
          </Text>
        </View>
        <View style={h.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>
            {formatFechaDoc(d.fechaInicio)} al {formatFechaDoc(d.fechaFin)}
          </Text>
        </View>
      </View>
      <View style={h.cardDerecha}>
        <Text style={[styles.valor, vencido && styles.atenuada]}>{valorDescuento(d)}</Text>
        <Etiqueta texto={v.texto} tono={v.tono} />
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Validar > Descuentos y promociones del cliente. Dos pestañas:
// - Descuentos: DESCUENTO_CLIART del cliente guardados en el equipo (Datos > Cargar datos); solo lectura.
// - Promociones: FR_PROMOCION activas para el cliente o su ruta (PromocionesLista).
// Atajo: al tocar un descuento, un popup ofrece Hacer pedido / Hacer cotización;
// onHacerDocumento('pedido' | 'cotizacion', descuento) abre la captura con ese artículo.
// tab / onTabChange: pestaña abierta (la guarda el contenedor para volver a ella desde el pedido).
export default function DescuentosView({
  cliente,
  ruta,
  onBack,
  onHacerDocumento,
  tab: tabInicial = 'descuentos',
  onTabChange,
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTabLocal] = useState(tabInicial);
  const setTab = (t) => {
    setTabLocal(t);
    onTabChange?.(t);
  };
  const [descuentos, setDescuentos] = useState([]);
  // ISO de la última carga de descuentos; null = nunca se descargaron.
  const [descargado, setDescargado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [texto, setTexto] = useState('');
  const [ocultarVencidos, setOcultarVencidos] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const scrollRef = useRef(null);
  // Descuento tocado (abre el popup); null = cerrado.
  const [elegido, setElegido] = useState(null);

  useEffect(() => {
    let cancelado = false;
    getDescuentosCliente(cliente.codigo)
      .then((r) => {
        if (cancelado) return;
        setDescuentos(r.descuentos);
        setDescargado(r.descargado);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los descuentos.');
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
    return descuentos.filter(
      (d) =>
        (!ocultarVencidos || d.vigencia !== VIGENCIA.vencido) &&
        (!q || normalizar(d[searchMode] ?? (searchMode === 'descripcion' ? d.articulo : '')).includes(q))
    );
  }, [descuentos, searchMode, texto, ocultarVencidos]);

  // Al cambiar la búsqueda se vuelve a la primera página.
  useEffect(() => {
    setPage(1);
  }, [texto, searchMode, ocultarVencidos]);

  const pagina = useMemo(() => filtrados.slice((page - 1) * pageSize, page * pageSize), [filtrados, page, pageSize]);

  const irAPagina = (n) => {
    setPage(n);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const vencidos = descuentos.filter((d) => d.vigencia === VIGENCIA.vencido).length;

  const vacio = cargando
    ? 'Cargando los descuentos...'
    : !descargado
      ? 'No hay descuentos descargados. Ve a Datos > Cargar datos.'
      : descuentos.length
        ? 'Ningún descuento coincide con la búsqueda'
        : 'Este cliente no tiene descuentos registrados';

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Descuentos y promociones" onBack={onBack} />

      <ScrollView ref={scrollRef} contentContainerStyle={h.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard cliente={cliente} ruta={ruta} descargado={descargado} />

        <TabsHistorial tabs={TABS} tab={tab} onChange={setTab} />

        {tab === 'descuentos' ? (
          <>
            {error ? <Text style={h.error}>{error}</Text> : null}

            <SearchBar
              modes={SEARCH_MODES}
              mode={searchMode}
              onModeChange={setSearchMode}
              query={texto}
              onQueryChange={setTexto}
            />
            {vencidos ? (
              <Checkbox
                label={`Ocultar vencidos (${vencidos})`}
                checked={ocultarVencidos}
                onChange={setOcultarVencidos}
              />
            ) : null}

            {filtrados.length ? (
              <View style={h.lista}>
                <Text style={h.contador}>
                  {filtrados.length} {filtrados.length === 1 ? 'descuento' : 'descuentos'}
                </Text>
                {pagina.map((d) => (
                  <DescuentoCard key={clave(d)} descuento={d} onPress={() => setElegido(d)} />
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
              <View style={h.empty}>
                {cargando ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Feather name="tag" size={28} color={colors.textDisabled} />
                )}
                <Text style={h.emptyText}>{vacio}</Text>
              </View>
            )}
          </>
        ) : (
          <PromocionesLista cliente={cliente} ruta={ruta} onHacerDocumento={onHacerDocumento} />
        )}
      </ScrollView>

      {/* Popup del descuento: atajo para hacer un pedido o una cotización con el artículo. */}
      <DetalleSheet
        visible={Boolean(elegido)}
        tipo="DESCUENTO"
        numero={elegido ? elegido.descripcion || elegido.articulo : ''}
        etiquetas={elegido ? <Etiqueta texto={VIGENCIAS[elegido.vigencia].texto} tono={VIGENCIAS[elegido.vigencia].tono} /> : null}
        onClose={() => setElegido(null)}
      >
        {elegido ? (
          <>
            <View style={h.sheetTotal}>
              <Text style={h.seccionLabel}>DESCUENTO</Text>
              <Text style={h.sheetTotalValor}>{valorDescuento(elegido)}</Text>
            </View>
            <View style={h.datos}>
              <Dato label="Código" value={elegido.articulo} />
              <Dato
                label="Cantidad"
                value={`De ${formatCantidad(elegido.cantMin)} a ${formatCantidad(elegido.cantMax)}`}
              />
              <Dato
                label="Vigencia"
                value={`${formatFechaDoc(elegido.fechaInicio)} al ${formatFechaDoc(elegido.fechaFin)}`}
              />
            </View>
            {elegido.vigencia !== VIGENCIA.vigente ? (
              <Text style={h.aviso}>
                Este descuento no está vigente hoy: el artículo se agregará sin este descuento.
              </Text>
            ) : null}
            {[
              { key: 'pedido', label: 'Hacer pedido', icon: 'shopping-cart' },
              { key: 'cotizacion', label: 'Hacer cotización', icon: 'file-text' },
            ].map((b) => (
              <Pressable
                key={b.key}
                onPress={() => {
                  const d = elegido;
                  setElegido(null);
                  onHacerDocumento?.(b.key, d);
                }}
                style={({ pressed }) => [h.printButton, pressed && h.pressed]}
              >
                <Feather name={b.icon} size={18} color={colors.onPrimary} />
                <Text style={h.printText}>{b.label}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </DetalleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  valor: { fontSize: 18, fontWeight: '800', color: colors.primary },
  atenuada: { opacity: 0.55 },
});
