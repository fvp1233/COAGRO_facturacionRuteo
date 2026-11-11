import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import ArticulosAgregadosModal from '../../components/pedido/ArticulosAgregadosModal';
import PedidoResumenModal from '../../components/pedido/PedidoResumenModal';
import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import Pagination from '../../components/ui/Pagination';
import SearchBar from '../../components/ui/SearchBar';
import { getArticulosPedido } from '../../repositories/articulos';
import { guardarPedido, TIPOS_PEDIDO } from '../../repositories/pedidos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { formatCantidad, formatMontoMoneda as monto, formatPorcentaje } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;

// Artículos por página (el usuario puede elegir otro tamaño en la barra de paginación).
const PAGE_SIZE = 10;

const SEARCH_MODES = [
  { key: 'descripcion', label: 'Descripción', icon: 'file-text' },
  { key: 'familia', label: 'Familia', icon: 'layers' },
  { key: 'codigo', label: 'Código', icon: 'hash' },
];

// Texto de un campo numérico -> número (acepta coma decimal); vacío o inválido = 0.
const valor = (texto) => {
  const n = Number(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Bonificación: aún no se descargan las tablas de bonificación (BONIFICACION_CLIART / _NIVEL).
const BONIFICACION = 0;

// Cantidad en unidades de almacén (ej. 1.5 barriles) -> "1 BARRIL + 100 LT" (detalle = fracción × factor).
// Si el factor es 1 el artículo no se fracciona y solo se muestra el almacén.
function unidades(cantidad, articulo) {
  const factor = articulo.factorVenta;
  const signo = cantidad < 0 ? '-' : '';
  const abs = Math.abs(cantidad);
  const alm = `${formatCantidad(Math.floor(abs))} ${articulo.empAlm}`.trim();
  if (factor <= 1) return `${signo}${formatCantidad(abs)} ${articulo.empAlm}`.trim();
  const det = Math.round((abs - Math.floor(abs)) * factor * 100) / 100;
  return `${signo}${alm} + ${formatCantidad(det)} ${articulo.empDet}`.trim();
}

// Lleva el detalle que pasa del factor al almacén: 0 barriles + 201 litros -> 1 + 1 (factor 200).
function normalizarDetalle(linea, factor) {
  const almacen = valor(linea.almacen);
  const detalle = valor(linea.detalle);
  if (factor <= 1 || detalle < factor) return linea;
  const extra = Math.floor(detalle / factor);
  const resto = Math.round((detalle - extra * factor) * 100) / 100;
  return { ...linea, almacen: String(almacen + extra), detalle: resto ? String(resto) : '' };
}

// Totales de una línea. El vendedor escribe almacén (enteros) y detalle (fracción del almacén,
// solo si FACTOR_VENTA > 1). Cantidad = almacén + detalle / FACTOR_VENTA, en unidades de almacén.
// PRECIO es por unidad de almacén. Existencia también viene en unidades de almacén (1.5 = 1 barril y medio).
// Descuento = % de línea que escribe el vendedor (no hay regla en el ERP; equivale a
// PEDIDO_LINEA.PORC_DESCUENTO). Mientras no lo escriba, se usa el % general del cliente. Adicional = impuestos del artículo sobre el subtotal con
// descuento: IMPUESTO1 menos la exención de ventas del cliente e IMPUESTO2 menos la de consumo.
// Inventario = existencia − lo pedido.
function calcular(articulo, linea, cliente) {
  const cantidad = valor(linea.almacen) + (articulo.factorVenta > 1 ? valor(linea.detalle) / articulo.factorVenta : 0);
  const subtotal = cantidad * articulo.precio;
  const porcDescuento = Math.min(100, Math.max(0, linea.descuento == null ? cliente.descuento : valor(linea.descuento)));
  const descuento = (subtotal * porcDescuento) / 100;
  const base = subtotal - descuento;
  const iva = (base * articulo.impuesto1 * (100 - cliente.exentoVentas)) / 10000;
  const oi = (base * articulo.impuesto2 * (100 - cliente.exentoConsumo)) / 10000;
  // Impuesto que no se cobra por la exención del cliente (MONTO_EXONERACION).
  const exoneracion = (base * (articulo.impuesto1 * cliente.exentoVentas + articulo.impuesto2 * cliente.exentoConsumo)) / 10000;
  const adicional = iva + oi;
  const total = base + adicional;
  const inventario = articulo.existencia - cantidad - BONIFICACION;
  return { cantidad, subtotal, porcDescuento, descuento, iva, oi, exoneracion, adicional, total, inventario };
}

// Card de un artículo: código, descripción, precio por unidad de almacén y existencia. Si ya está en
// el pedido se marca con su cantidad (al tocarla se carga lo capturado para corregirlo).
const ArticuloCard = memo(function ArticuloCard({ articulo, agregado, onPress }) {
  const sinExistencia = articulo.existencia <= 0;
  return (
    <Pressable
      onPress={() => onPress(articulo)}
      style={({ pressed }) => [styles.artCard, agregado && styles.artCardAgregado, pressed && styles.pressed]}
    >
      <View style={styles.artBody}>
        <View style={styles.artTop}>
          <View style={styles.codeChip}>
            <Text style={styles.codeText}>{articulo.codigo}</Text>
          </View>
          {agregado ? (
            <View style={styles.enPedido}>
              <Feather name="shopping-cart" size={11} color={colors.success} />
              <Text style={styles.enPedidoText} numberOfLines={1}>{agregado.cantidadTexto}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.artNombre} numberOfLines={2}>{articulo.descripcion}</Text>
        <View style={styles.artMeta}>
          <Feather name="package" size={12} color={sinExistencia ? colors.error : colors.textMuted} />
          <Text style={[styles.artMetaText, sinExistencia && styles.alerta]} numberOfLines={1}>
            {unidades(articulo.existencia, articulo)}
          </Text>
        </View>
      </View>
      <View style={styles.artPrecioBox}>
        <Text style={styles.artPrecio}>{monto(articulo.precio, articulo.moneda)}</Text>
        {articulo.empAlm ? <Text style={styles.artUnidad}>por {articulo.empAlm}</Text> : null}
      </View>
    </Pressable>
  );
});

// entero: solo dígitos (teclado numérico sin punto). disabled: se muestra pero no se puede escribir.
function Campo({ label, value, onChange, onBlur, entero = false, disabled = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        value={value}
        onChangeText={(t) => onChange(entero ? t.replace(/\D/g, '') : t)}
        onBlur={onBlur}
        editable={!disabled}
        keyboardType={entero ? 'number-pad' : 'decimal-pad'}
        placeholder="0"
        placeholderTextColor={colors.textDisabled}
      />
    </View>
  );
}

function Dato({ label, value, alerta = false }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.readOnly, alerta && styles.alerta]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// Detalle del pedido: artículos de la ruta activa (su grupo y su bodega del ERP) con precio vigente
// en la lista elegida en el encabezado, en cards. Al tocar un artículo se abre un popup con sus
// datos; el usuario escribe la cantidad y, si aplica, el % de descuento, y lo agrega al pedido con
// el botón Agregar (como un carrito: una línea por artículo; volver a agregarlo la reemplaza). La lupa abre la lista
// de agregados, donde se pueden eliminar. Total = suma de todas las líneas agregadas.
// encabezado: lo elegido en PedidoView (país, condición de pago, nivel de precio, moneda, subtipo...).
// onGuardado(numero): se llama después de guardar el pedido (el contenedor registra la visita y
// vuelve al menú del cliente). tipo: TIPOS_PEDIDO.pedido o .cotizacion (cambia textos y TIP_DOC).
export default function PedidoArticulosView({
  cliente,
  ruta,
  encabezado,
  tipo = TIPOS_PEDIDO.pedido,
  onBack,
  onGuardado,
}) {
  const insets = useSafeAreaInsets();
  const [articulos, setArticulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  // Filtro inicial: por descripción.
  const [searchMode, setSearchMode] = useState('descripcion');
  const [texto, setTexto] = useState('');
  // Búsqueda aplicada: solo cambia con Enter o con el botón de buscar.
  // Al abrir se muestran todos los artículos (paginados); buscar sin texto vuelve a mostrar todos.
  const [busqueda, setBusqueda] = useState({ mode: 'descripcion', q: '' });
  // false = solo artículos con existencia > 0 (lo normal al vender).
  const [sinExistencia, setSinExistencia] = useState(false);
  const [seleccion, setSeleccion] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const listaRef = useRef(null);
  // Lo que se está capturando del artículo seleccionado: { almacen, detalle, descuento (textos;
  // descuento ausente = % general del cliente), canastaBasica }.
  const [borrador, setBorrador] = useState({});
  // Líneas agregadas al pedido, en orden: { codigo, descripcion, moneda, precio, almacen, detalle,
  // cantidad (en unidades de almacén), cantidadTexto, porcDescuento, canastaBasica, subtotal,
  // descuento, iva, oi, exoneracion, adicional (iva + oi), total, factorVenta, impuesto1, impuesto2,
  // esOtroCargo, borrador }.
  const [agregados, setAgregados] = useState([]);
  const [verAgregados, setVerAgregados] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const datosCliente = {
    descuento: encabezado?.descuento ?? 0,
    exentoVentas: encabezado?.exentoVentas ?? 0,
    exentoConsumo: encabezado?.exentoConsumo ?? 0,
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const activa = await getRutaActiva();
      return getArticulosPedido(activa, encabezado?.nivelPrecio, encabezado?.moneda);
    })()
      .then(({ articulos: lista, aviso: mensaje }) => {
        if (cancelado) return;
        setArticulos(lista);
        setAviso(mensaje ?? '');
      })
      .catch(() => {
        if (!cancelado) setError('No se pudieron leer los artículos de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [encabezado?.nivelPrecio, encabezado?.moneda]);

  // Coincidencia parcial (como LIKE '%texto%'), sin distinguir mayúsculas ni acentos.
  const filtrados = useMemo(() => {
    if (!busqueda) return [];
    const q = normalizar(busqueda.q);
    // Por defecto solo los artículos con existencia; con la casilla marcada, todos.
    return articulos.filter(
      (a) => (sinExistencia || a.existencia > 0) && (!q || normalizar(a[busqueda.mode]).includes(q))
    );
  }, [articulos, busqueda, sinExistencia]);

  // Solo se renderiza la página actual para no saturar el teléfono con miles de cards.
  const pagina = useMemo(
    () => filtrados.slice((page - 1) * pageSize, page * pageSize),
    [filtrados, page, pageSize]
  );

  const irAPagina = (n) => {
    setPage(n);
    listaRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const articulo = articulos.find((a) => a.codigo === seleccion) ?? null;
  const linea = articulo ? { almacen: '', detalle: '', canastaBasica: articulo.canastaBasica, ...borrador } : null;
  const calculo = articulo ? calcular(articulo, linea, datosCliente) : null;

  const totalPedido = agregados.reduce((suma, l) => suma + l.total, 0);
  const monedaPedido = agregados[0]?.moneda ?? articulo?.moneda;

  const cambiar = (campo) => (v) => setBorrador((prev) => ({ ...prev, [campo]: v }));

  // Si el artículo ya está agregado, se carga lo que tenía para poder corregirlo; si es nuevo, la
  // cantidad en almacén arranca en 1.
  const seleccionar = (a) => {
    setSeleccion(a.codigo);
    setBorrador(agregados.find((l) => l.codigo === a.codigo)?.borrador ?? { almacen: '1' });
  };

  const agregar = () => {
    if (!articulo) {
      Alert.alert('Agregar artículo', 'Selecciona un artículo primero.');
      return;
    }
    if (calculo.cantidad <= 0) {
      Alert.alert('Agregar artículo', 'Escribe la cantidad en almacén o en detalle.');
      return;
    }
    const final = normalizarDetalle(linea, articulo.factorVenta);
    const nueva = {
      codigo: articulo.codigo,
      descripcion: articulo.descripcion,
      moneda: articulo.moneda,
      precio: articulo.precio,
      almacen: valor(final.almacen),
      detalle: articulo.factorVenta > 1 ? valor(final.detalle) : 0,
      cantidad: calculo.cantidad,
      cantidadTexto: unidades(calculo.cantidad, articulo),
      porcDescuento: calculo.porcDescuento,
      canastaBasica: linea.canastaBasica,
      subtotal: calculo.subtotal,
      descuento: calculo.descuento,
      iva: calculo.iva,
      oi: calculo.oi,
      exoneracion: calculo.exoneracion,
      adicional: calculo.adicional,
      factorVenta: articulo.factorVenta,
      impuesto1: articulo.impuesto1,
      impuesto2: articulo.impuesto2,
      esOtroCargo: articulo.esOtroCargo,
      total: calculo.total,
      borrador: final,
    };
    setAgregados((prev) =>
      prev.some((l) => l.codigo === nueva.codigo)
        ? prev.map((l) => (l.codigo === nueva.codigo ? nueva : l))
        : [...prev, nueva]
    );
    setSeleccion(null);
    setBorrador({});
  };

  const cerrarCaptura = () => {
    setSeleccion(null);
    setBorrador({});
  };

  // Línea ya agregada por código (para marcar las cards que están en el pedido).
  const enPedido = useMemo(() => new Map(agregados.map((l) => [l.codigo, l])), [agregados]);

  const eliminar = (codigo) => {
    const l = agregados.find((x) => x.codigo === codigo);
    Alert.alert('Eliminar artículo', `¿Quitar ${l?.descripcion ?? codigo} ${tipo.del}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => setAgregados((prev) => prev.filter((x) => x.codigo !== codigo)),
      },
    ]);
  };

  const siguiente = () => {
    if (!agregados.length) {
      Alert.alert(`Resumen ${tipo.del}`, 'Agrega al menos un artículo con el botón +.');
      return;
    }
    setVerResumen(true);
  };

  // Inserta el pedido en la base local (alFAC_ENC_PED + alFAC_DET_PED) con la bodega del ERP de la
  // ruta activa. Si se guarda, avisa con el número y vuelve al menú del cliente.
  const guardar = async (entrega, notas) => {
    try {
      const activa = await getRutaActiva();
      const numero = await guardarPedido({
        ruta,
        cliente: cliente.codigo,
        bodega: activa?.bodegaErp ?? null,
        encabezado,
        lineas: agregados,
        entrega,
        notas,
        fin: new Date(),
        tipoDoc: tipo.tipoDoc,
      });
      setVerResumen(false);
      Alert.alert(tipo.guardado, `Se guardó ${tipo.el} ${numero}.`);
      await onGuardado?.(numero);
    } catch (e) {
      Alert.alert(`No se pudo guardar ${tipo.el}`, e?.message || 'Error al insertar en la base local.');
    }
  };

  const salir = () => {
    if (!agregados.length) {
      onBack?.();
      return;
    }
    Alert.alert(`Salir ${tipo.del}`, 'Se perderán los artículos capturados. ¿Deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: onBack },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title={`Artículos ${tipo.del}`} onBack={salir} />

      <FlatList
        ref={listaRef}
        data={cargando ? [] : pagina}
        keyExtractor={(a) => a.codigo}
        renderItem={({ item }) => (
          <ArticuloCard articulo={item} agregado={enPedido.get(item.codigo)} onPress={seleccionar} />
        )}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.infoRow}>
              <Text style={styles.info} numberOfLines={1}>
                {cliente.codigo} · {cliente.nombre}
                {encabezado?.nivelPrecio ? ` · ${encabezado.nivelPrecio}` : ''}
              </Text>
            </View>

            {error ? <Text style={styles.warning}>{error}</Text> : null}
            {!error && aviso ? <Text style={styles.warning}>{aviso}</Text> : null}

            <SearchBar
              modes={SEARCH_MODES}
              mode={searchMode}
              onModeChange={setSearchMode}
              query={texto}
              onQueryChange={setTexto}
              onSubmit={(q) => {
                setBusqueda({ mode: searchMode, q });
                setPage(1);
              }}
            />

            <View style={styles.filtroRow}>
              <Text style={styles.contador}>
                {cargando ? '' : `${filtrados.length} ${filtrados.length === 1 ? 'artículo' : 'artículos'}`}
              </Text>
              <Checkbox
                label="Incluir artículos sin existencia"
                checked={sinExistencia}
                onChange={(v) => {
                  setSinExistencia(v);
                  irAPagina(1);
                }}
              />
            </View>
          </View>
        }
        ListFooterComponent={
          !cargando && filtrados.length > 0 ? (
            <View style={styles.paginacion}>
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
          ) : null
        }
        ListEmptyComponent={
          cargando ? (
            <ActivityIndicator color={ACCENT} style={styles.loading} />
          ) : (
            <View style={styles.emptyBox}>
              <Feather name="search" size={28} color={colors.textDisabled} />
              <Text style={styles.empty}>
                {busqueda
                  ? 'No hay artículos para mostrar'
                  : 'Escribe en la búsqueda y presiona buscar para ver los artículos'}
              </Text>
            </View>
          )
        }
      />

      {/* Popup de captura del artículo seleccionado. */}
      <Modal visible={Boolean(articulo)} transparent animationType="slide" onRequestClose={cerrarCaptura}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={cerrarCaptura} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            {articulo ? (
              <>
                <View style={styles.sheetHeader}>
                  <View style={styles.sheetTitulo}>
                    <View style={styles.codeChip}>
                      <Text style={styles.codeText}>{articulo.codigo}</Text>
                    </View>
                    <Text style={styles.sheetNombre} numberOfLines={3}>{articulo.descripcion}</Text>
                  </View>
                  <Pressable onPress={cerrarCaptura} hitSlop={10}>
                    <Feather name="x" size={22} color={colors.textMuted} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                  {/* Existencia e inventario (lo que queda después de este pedido). */}
                  <View style={styles.stockRow}>
                    <View style={styles.stockItem}>
                      <Text style={styles.stockLabel}>EXISTENCIA</Text>
                      <Text style={styles.stockValor}>{unidades(articulo.existencia, articulo)}</Text>
                    </View>
                    <View style={styles.stockItem}>
                      <Text style={styles.stockLabel}>INVENTARIO</Text>
                      <Text style={[styles.stockValor, calculo.inventario < 0 && styles.alerta]}>
                        {unidades(calculo.inventario, articulo)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.seccion}>CANTIDAD</Text>
                  <View style={styles.grid}>
                    <Campo
                      label={`Almacén${articulo.empAlm ? ` (${articulo.empAlm})` : ''}`}
                      value={linea.almacen}
                      onChange={cambiar('almacen')}
                      entero
                    />
                    <Campo
                      label={
                        articulo.factorVenta > 1
                          ? `Detalle (${articulo.empDet || 'unid.'} · ${formatCantidad(articulo.factorVenta)} x ${articulo.empAlm || 'alm.'})`
                          : 'Detalle (no se fracciona)'
                      }
                      value={articulo.factorVenta > 1 ? linea.detalle : ''}
                      onChange={cambiar('detalle')}
                      onBlur={() => setBorrador((prev) => normalizarDetalle({ ...linea, ...prev }, articulo.factorVenta))}
                      disabled={articulo.factorVenta <= 1}
                    />
                  </View>

                  <Text style={styles.seccion}>PRECIO Y DESCUENTO</Text>
                  <View style={styles.grid}>
                    {/* Precio de lista por unidad de almacén, siempre visible para el vendedor. */}
                    <Dato
                      label={`Precio${articulo.empAlm ? ` (${articulo.empAlm})` : ''}`}
                      value={monto(articulo.precio, articulo.moneda)}
                    />
                    <Campo
                      label={`Descuento % (${monto(calculo.descuento, articulo.moneda)})`}
                      value={linea.descuento ?? (datosCliente.descuento ? String(datosCliente.descuento) : '')}
                      onChange={cambiar('descuento')}
                    />
                    <Dato label="Bonificación" value={formatCantidad(BONIFICACION)} />
                    <Dato
                      label={`Adicional (${formatPorcentaje(articulo.impuesto1 + articulo.impuesto2)})`}
                      value={monto(calculo.adicional, articulo.moneda)}
                    />
                  </View>

                  <Checkbox label="Es canasta básica" checked={linea.canastaBasica} onChange={cambiar('canastaBasica')} />

                  <View style={styles.totales}>
                    <View style={styles.totalFila}>
                      <Text style={styles.totalLabel}>Subtotal</Text>
                      <Text style={styles.totalValor}>{monto(calculo.subtotal, articulo.moneda)}</Text>
                    </View>
                    <View style={styles.totalFila}>
                      <Text style={styles.totalLabelFuerte}>Total de línea</Text>
                      <Text style={styles.totalValorFuerte}>{monto(calculo.total, articulo.moneda)}</Text>
                    </View>
                  </View>
                </ScrollView>

                <Pressable onPress={agregar} style={({ pressed }) => [styles.agregarButton, pressed && styles.pressed]}>
                  <Feather name={enPedido.has(articulo.codigo) ? 'check' : 'plus'} size={20} color={colors.onPrimary} />
                  <Text style={styles.agregarText}>
                    {enPedido.has(articulo.codigo) ? 'Actualizar artículo' : 'Agregar artículo'}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.bar}>
        <Pressable
          onPress={() => setVerAgregados(true)}
          style={({ pressed }) => [styles.barButton, styles.barSecondary, pressed && styles.pressed]}
        >
          <Feather name="search" size={20} color={ACCENT} />
          {agregados.length ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{agregados.length}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.barTotal}>
          <Text style={styles.barTotalLabel}>Total {tipo.del}</Text>
          <Text style={styles.barTotalValue}>{monto(totalPedido, monedaPedido)}</Text>
        </View>
        <Pressable
          onPress={siguiente}
          style={({ pressed }) => [styles.barButton, styles.barPrimary, (pressed || !agregados.length) && styles.pressed]}
        >
          <Feather name="arrow-right" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ArticulosAgregadosModal
        visible={verAgregados}
        lineas={agregados}
        total={totalPedido}
        tipo={tipo}
        formatMonto={monto}
        onEliminar={eliminar}
        onClose={() => setVerAgregados(false)}
      />
      <PedidoResumenModal
        visible={verResumen}
        cliente={cliente}
        encabezado={encabezado}
        tipo={tipo}
        lineas={agregados}
        formatMonto={monto}
        onGuardar={guardar}
        onClose={() => setVerResumen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  info: { flex: 1, fontSize: 12, color: colors.textMuted },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: { marginTop: spacing.lg },
  header: { gap: spacing.md },
  filtroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  paginacion: { marginTop: spacing.md },
  contador: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  emptyBox: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  // Card del artículo.
  artCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    marginTop: spacing.sm + 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  artCardAgregado: { borderColor: colors.success, borderLeftWidth: 4 },
  artBody: { flex: 1, gap: 4 },
  artTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  codeChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  enPedido: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E3F2F1',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  enPedidoText: { fontSize: 11, fontWeight: '700', color: colors.success },
  artNombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  artMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  artMetaText: { flexShrink: 1, fontSize: 12, color: colors.textMuted },
  artPrecioBox: { alignItems: 'flex-end' },
  artPrecio: { fontSize: 16, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  artUnidad: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  // Popup de captura.
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.md + 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md + 4,
    paddingBottom: spacing.sm,
  },
  sheetTitulo: { flex: 1, gap: 6 },
  sheetNombre: { fontSize: 17, fontWeight: '700', color: colors.text },
  sheetContent: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.md, gap: spacing.sm + 4 },
  stockRow: { flexDirection: 'row', gap: spacing.sm },
  stockItem: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  stockLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  stockValor: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },
  seccion: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted, marginTop: spacing.xs },
  totales: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  totalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  totalLabel: { fontSize: 14, color: colors.textMuted },
  totalValor: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  totalLabelFuerte: { fontSize: 15, fontWeight: '700', color: colors.text },
  totalValorFuerte: { fontSize: 20, fontWeight: '800', color: ACCENT, fontVariant: ['tabular-nums'] },
  agregarButton: {
    height: 50,
    marginHorizontal: spacing.md + 4,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  agregarText: { fontSize: 16, fontWeight: '700', color: colors.onPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm + 4 },
  field: { width: '48%', gap: 4 },
  label: { fontSize: 12, color: colors.textMuted },
  input: {
    height: 42,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
    textAlign: 'right',
  },
  inputDisabled: { backgroundColor: colors.surface, color: colors.textMuted },
  readOnly: {
    height: 42,
    lineHeight: 42,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  alerta: { color: colors.error },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barSecondary: { backgroundColor: colors.primarySoft },
  barPrimary: { backgroundColor: ACCENT },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.onPrimary },
  barTotal: { flex: 1, alignItems: 'center' },
  barTotalLabel: { fontSize: 12, color: colors.textMuted },
  barTotalValue: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.8 },
});
