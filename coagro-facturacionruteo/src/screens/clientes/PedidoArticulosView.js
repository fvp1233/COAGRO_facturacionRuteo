import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import ArticulosAgregadosModal from '../../components/pedido/ArticulosAgregadosModal';
import PedidoResumenModal from '../../components/pedido/PedidoResumenModal';
import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import DataTable from '../../components/ui/DataTable';
import SearchBar from '../../components/ui/SearchBar';
import { getArticulosPedido } from '../../repositories/articulos';
import { guardarPedido } from '../../repositories/pedidos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { formatCantidad, formatMonto, formatPorcentaje } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;

const SEARCH_MODES = [
  { key: 'familia', label: 'Familia', icon: 'layers' },
  { key: 'descripcion', label: 'Descripción', icon: 'file-text' },
  { key: 'codigo', label: 'Código', icon: 'hash' },
];

// Texto de un campo numérico -> número (acepta coma decimal); vacío o inválido = 0.
const valor = (texto) => {
  const n = Number(String(texto ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Monto en la moneda del precio: 'D' en dólares ($); otra moneda lleva su código delante.
const monto = (n, moneda) =>
  moneda === 'D'
    ? formatMonto(n)
    : `${moneda ?? ''} ${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();

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

const COLUMNS = [
  { key: 'codigo', title: 'CÓDIGO', width: 84, numberOfLines: 1 },
  { key: 'descripcion', title: 'DESCRIPCIÓN', width: 200, grow: true },
  { key: 'factorVenta', title: 'FACTOR', width: 64, align: 'right', render: (a) => <Text style={styles.num}>{formatCantidad(a.factorVenta)}</Text> },
  { key: 'precio', title: 'PRECIO', width: 96, align: 'right', render: (a) => <Text style={styles.num}>{monto(a.precio, a.moneda)}</Text> },
];

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
// en la lista elegida en el encabezado. Al elegir un artículo en la tabla, abajo se llenan sus
// datos; el usuario escribe la cantidad y, si aplica, el % de descuento, y lo agrega al pedido con +
// (como un carrito: una línea por artículo; volver a agregarlo la reemplaza). La lupa abre la lista
// de agregados, donde se pueden eliminar. Total = suma de todas las líneas agregadas.
// encabezado: lo elegido en PedidoView (país, condición de pago, nivel de precio, moneda, subtipo...).
// onGuardado(numero): se llama después de guardar el pedido (el contenedor registra la visita y
// vuelve al menú del cliente).
export default function PedidoArticulosView({ cliente, ruta, encabezado, onBack, onGuardado }) {
  const insets = useSafeAreaInsets();
  const [articulos, setArticulos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [texto, setTexto] = useState('');
  // Búsqueda aplicada: solo cambia con Enter o con el botón de buscar.
  // null = aún no se ha buscado: la tabla arranca vacía (buscar sin texto muestra todos).
  const [busqueda, setBusqueda] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
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
    return q ? articulos.filter((a) => normalizar(a[busqueda.mode]).includes(q)) : articulos;
  }, [articulos, busqueda]);

  const articulo = articulos.find((a) => a.codigo === seleccion) ?? null;
  const linea = articulo ? { almacen: '', detalle: '', canastaBasica: articulo.canastaBasica, ...borrador } : null;
  const calculo = articulo ? calcular(articulo, linea, datosCliente) : null;

  const totalPedido = agregados.reduce((suma, l) => suma + l.total, 0);
  const monedaPedido = agregados[0]?.moneda ?? articulo?.moneda;

  const cambiar = (campo) => (v) => setBorrador((prev) => ({ ...prev, [campo]: v }));

  // Si el artículo ya está agregado, se carga lo que tenía para poder corregirlo.
  const seleccionar = (a) => {
    setSeleccion(a.codigo);
    setBorrador(agregados.find((l) => l.codigo === a.codigo)?.borrador ?? {});
  };

  const agregar = () => {
    if (!articulo) {
      Alert.alert('Agregar artículo', 'Selecciona un artículo de la tabla primero.');
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

  const eliminar = (codigo) => {
    const l = agregados.find((x) => x.codigo === codigo);
    Alert.alert('Eliminar artículo', `¿Quitar ${l?.descripcion ?? codigo} del pedido?`, [
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
      Alert.alert('Resumen del pedido', 'Agrega al menos un artículo con el botón +.');
      return;
    }
    setVerResumen(true);
  };

  // Inserta el pedido en la base local (alFAC_ENC_PED + alFAC_DET_PED) con la bodega del ERP de la
  // ruta activa. Si se guarda, avisa con el número y vuelve al menú del cliente.
  const guardar = async (entrega) => {
    try {
      const activa = await getRutaActiva();
      const numero = await guardarPedido({
        ruta,
        cliente: cliente.codigo,
        bodega: activa?.bodegaErp ?? null,
        encabezado,
        lineas: agregados,
        entrega,
        fin: new Date(),
      });
      setVerResumen(false);
      Alert.alert('Pedido guardado', `Se guardó el pedido ${numero}.`);
      await onGuardado?.(numero);
    } catch (e) {
      Alert.alert('No se pudo guardar el pedido', e?.message || 'Error al insertar en la base local.');
    }
  };

  const salir = () => {
    if (!agregados.length) {
      onBack?.();
      return;
    }
    Alert.alert('Salir del pedido', 'Se perderán los artículos capturados. ¿Deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: onBack },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Artículos del pedido" onBack={salir} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoRow}>
          <Text style={styles.info} numberOfLines={1}>
            {cliente.codigo} · {cliente.nombre}
            {encabezado?.nivelPrecio ? ` · ${encabezado.nivelPrecio}` : ''}
          </Text>
          <View style={styles.countChip}>
            <Feather name="shopping-cart" size={12} color={colors.textMuted} />
            <Text style={styles.countText}>{agregados.length}</Text>
          </View>
        </View>

        {error ? <Text style={styles.warning}>{error}</Text> : null}
        {!error && aviso ? <Text style={styles.warning}>{aviso}</Text> : null}

        {cargando ? (
          <ActivityIndicator color={ACCENT} style={styles.loading} />
        ) : (
          <DataTable
            columns={COLUMNS}
            data={filtrados}
            keyExtractor={(a) => a.codigo}
            onRowPress={seleccionar}
            selectedKey={seleccion}
            highlightKey={busqueda?.mode}
            emptyText={
              busqueda ? 'No hay artículos para mostrar' : 'Escribe en la búsqueda y presiona buscar para ver los artículos'
            }
          />
        )}

        <SearchBar
          modes={SEARCH_MODES}
          mode={searchMode}
          onModeChange={setSearchMode}
          query={texto}
          onQueryChange={setTexto}
          onSubmit={(q) => setBusqueda({ mode: searchMode, q })}
        />

        <View style={styles.card}>
          {articulo ? (
            <>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {articulo.codigo} - {articulo.descripcion}
              </Text>
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
                <Dato label="Subtotal" value={monto(calculo.subtotal, articulo.moneda)} />
                <Dato
                  label={`Adicional (${formatPorcentaje(articulo.impuesto1 + articulo.impuesto2)})`}
                  value={monto(calculo.adicional, articulo.moneda)}
                />
                <Dato label="Total de línea" value={monto(calculo.total, articulo.moneda)} />
                <Dato label="Existencia" value={unidades(articulo.existencia, articulo)} />
                <Dato label="Inventario" value={unidades(calculo.inventario, articulo)} alerta={calculo.inventario < 0} />
              </View>
              <Checkbox label="Es canasta básica" checked={linea.canastaBasica} onChange={cambiar('canastaBasica')} />
            </>
          ) : (
            <Text style={styles.empty}>Selecciona un artículo de la tabla para ver sus datos y escribir la cantidad.</Text>
          )}
        </View>
      </ScrollView>

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
          <Text style={styles.barTotalLabel}>Total del pedido</Text>
          <Text style={styles.barTotalValue}>{monto(totalPedido, monedaPedido)}</Text>
        </View>
        <Pressable onPress={agregar} style={({ pressed }) => [styles.barButton, styles.barPrimary, pressed && styles.pressed]}>
          <Feather name="plus" size={22} color={colors.onPrimary} />
        </Pressable>
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
        formatMonto={monto}
        onEliminar={eliminar}
        onClose={() => setVerAgregados(false)}
      />
      <PedidoResumenModal
        visible={verResumen}
        cliente={cliente}
        encabezado={encabezado}
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
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  countText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: { marginTop: spacing.lg },
  num: { textAlign: 'right', fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
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
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
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
