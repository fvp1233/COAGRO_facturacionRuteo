import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { ACTIVIDAD, getResumenDia } from '../../repositories/actividad';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Tarjetas de resumen: cada una filtra la actividad de abajo.
const FILTROS = {
  todo: 'todo',
  visitas: 'visitas',
  ...ACTIVIDAD,
};

// Cómo se muestra cada tipo de registro en la línea de tiempo.
const TIPOS = {
  visitas: { titulo: 'Visita', icono: 'map-marker-check', color: colors.success },
  [ACTIVIDAD.pedido]: { titulo: 'Pedido', icono: 'cart-plus', color: colors.primary },
  [ACTIVIDAD.cotizacion]: { titulo: 'Cotización', icono: 'file-document-edit-outline', color: '#3D6DB5' },
  [ACTIVIDAD.aprobacion]: { titulo: 'Cotización aprobada', icono: 'file-check-outline', color: '#3D6DB5' },
  [ACTIVIDAD.cobro]: { titulo: 'Cobro', icono: 'cash', color: colors.success },
  [ACTIVIDAD.promocional]: { titulo: 'Promocional', icono: 'library-shelves', color: colors.warning },
};

const FORMAS = [
  ['EFECTIVO', 'Efectivo'],
  ['CHEQUE', 'Cheque'],
  ['TRANSFERENCIA', 'Transferencia'],
  ['DEPOSITO', 'Depósito'],
];

// 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'.
const hora = (v) => /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0] ?? '';

const hoyLargo = () => new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

// Tarjeta de resumen (cantidad, monto opcional). Tocarla filtra la actividad; tocarla otra vez quita el filtro.
function Tile({ icono, titulo, valor, sub, activo, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, activo && styles.tileActivo, pressed && styles.pressed]}
    >
      <View style={styles.tileTop}>
        <MaterialCommunityIcons name={icono} size={18} color={activo ? colors.onPrimary : colors.primary} />
        <Text style={[styles.tileTitulo, activo && styles.textoActivo]} numberOfLines={1}>{titulo}</Text>
      </View>
      <Text style={[styles.tileValor, activo && styles.textoActivo]}>{valor}</Text>
      {sub ? <Text style={[styles.tileSub, activo && styles.textoActivo]} numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

// Card de un registro de la línea de tiempo (visita o documento).
function ItemCard({ item }) {
  const t = TIPOS[item.tipo];
  let titulo = t.titulo;
  let lineas = [];
  let derecha = null;
  if (item.tipo === 'visitas') {
    titulo = `Visita · ${item.estado}`;
    lineas = [item.notas].filter(Boolean);
  } else if (item.tipo === ACTIVIDAD.cobro) {
    titulo = `Cobro${item.detalle.recibo ? ` · ${item.detalle.recibo}` : ''}`;
    lineas = [`Documento ${item.documento}${item.detalle.cancelado ? ' · cancelado' : ' · abono'}`];
    derecha = formatMonto(item.monto);
  } else if (item.tipo === ACTIVIDAD.promocional) {
    lineas = [item.detalle.notas, item.detalle.requerida ? `Requerida: ${formatFechaDoc(item.detalle.requerida)}` : null].filter(
      Boolean
    );
  } else {
    titulo = `${t.titulo} · ${item.documento}`;
    if (item.detalle.articulos) lineas = [`${item.detalle.articulos} ${item.detalle.articulos === 1 ? 'artículo' : 'artículos'}`];
    derecha = formatMonto(item.monto);
  }
  const colorBorde = item.tipo === 'visitas' && !item.efectiva ? colors.warning : t.color;
  return (
    <View style={[styles.item, { borderLeftColor: colorBorde }]}>
      <View style={[styles.itemIcono, { backgroundColor: `${t.color}1A` }]}>
        <MaterialCommunityIcons name={t.icono} size={18} color={t.color} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.itemTitulo} numberOfLines={1}>{titulo}</Text>
        <Text style={styles.itemCliente} numberOfLines={1}>
          {item.nombre}{item.cliente && item.nombre !== item.cliente ? ` (${item.cliente})` : ''}
        </Text>
        {lineas.map((l, i) => (
          <Text key={i} style={styles.itemMeta} numberOfLines={2}>{l}</Text>
        ))}
      </View>
      <View style={styles.itemDerecha}>
        {derecha ? <Text style={styles.itemMonto}>{derecha}</Text> : null}
        <Text style={styles.itemHora}>{hora(item.hora)}</Text>
      </View>
    </View>
  );
}

// Reportes > Visitas (Mi día): cómo va la jornada de hoy, sin conexión. Avance de visitas contra los
// clientes programados hoy, y lo logrado: pedidos, cotizaciones (creadas y aprobadas), cobros y
// promocionales, con totales y la línea de tiempo del día. Las tarjetas filtran la línea de tiempo.
export default function MiDiaReporteView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState(FILTROS.todo);
  const [verPendientes, setVerPendientes] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await getResumenDia());
      setError('');
    } catch (e) {
      setError(e?.message || 'No se pudo leer la actividad del día.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const resumen = useMemo(() => {
    if (!datos) return null;
    const de = (tipo) => datos.actividad.filter((a) => a.tipo === tipo);
    const suma = (lista) => lista.reduce((s, a) => s + a.monto, 0);
    const cobros = de(ACTIVIDAD.cobro);
    const formas = {};
    for (const c of cobros) {
      for (const [forma, monto] of Object.entries(c.detalle.formas ?? {})) formas[forma] = (formas[forma] ?? 0) + Number(monto);
    }
    const clientesVisitados = new Set(datos.visitas.map((v) => `${v.ruta}|${v.cliente}`)).size;
    return {
      visitas: datos.visitas.length,
      clientesVisitados,
      efectivas: datos.visitas.filter((v) => v.efectiva).length,
      pedidos: de(ACTIVIDAD.pedido),
      cotizaciones: de(ACTIVIDAD.cotizacion),
      aprobaciones: de(ACTIVIDAD.aprobacion),
      cobros,
      promocionales: de(ACTIVIDAD.promocional),
      suma,
      formas,
      // Vendido = pedidos nuevos + cotizaciones aprobadas (pasan a pedido).
      vendido: suma(de(ACTIVIDAD.pedido)) + suma(de(ACTIVIDAD.aprobacion)),
    };
  }, [datos]);

  // Línea de tiempo: visitas + bitácora, de lo más reciente a lo más viejo, con el filtro elegido.
  const items = useMemo(() => {
    if (!datos) return [];
    const visitas = datos.visitas.map((v) => ({ ...v, tipo: 'visitas', hora: v.inicio, detalle: {} }));
    return [...visitas, ...datos.actividad]
      .filter((i) => filtro === FILTROS.todo || i.tipo === filtro)
      .sort((a, b) => String(b.hora).localeCompare(String(a.hora)));
  }, [datos, filtro]);

  const alternar = (f) => setFiltro((actual) => (actual === f ? FILTROS.todo : f));
  const avance = datos?.planificados ? Math.min(1, datos.visitadosPlan / datos.planificados) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Mi día" onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => {
              setRefrescando(true);
              cargar();
            }}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.dia}>
          <MaterialCommunityIcons name="calendar-today" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.diaTitulo}>¿Cómo voy hoy?</Text>
            <Text style={styles.diaFecha}>{hoyLargo()}</Text>
          </View>
          <Pressable onPress={cargar} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Feather name="refresh-cw" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {cargando ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}

        {resumen ? (
          <>
            {/* Avance de visitas contra lo programado hoy. */}
            <View style={styles.avance}>
              <View style={styles.avanceTop}>
                <Text style={styles.avanceTitulo}>Visitas programadas</Text>
                <Text style={styles.avanceValor}>
                  {datos.visitadosPlan} de {datos.planificados}
                </Text>
              </View>
              <View style={styles.barra}>
                <View style={[styles.barraLlena, { width: `${Math.round(avance * 100)}%` }]} />
              </View>
              <Text style={styles.avanceMeta}>
                {datos.planificados
                  ? `${Math.round(avance * 100)}% del día · ${datos.noVisitados.length} por visitar`
                  : 'No hay clientes programados para hoy en tus rutas'}
              </Text>
              {datos.noVisitados.length ? (
                <Pressable onPress={() => setVerPendientes((v) => !v)} hitSlop={6}>
                  <Text style={styles.link}>{verPendientes ? 'Ocultar pendientes' : 'Ver clientes por visitar'}</Text>
                </Pressable>
              ) : null}
              {verPendientes
                ? datos.noVisitados.map((c) => (
                    <View key={`${c.ruta}|${c.codigo}`} style={styles.pendiente}>
                      <Feather name="circle" size={10} color={colors.warning} />
                      <Text style={styles.pendienteText} numberOfLines={1}>
                        {c.nombre} ({c.codigo}) · Ruta {c.ruta}
                      </Text>
                    </View>
                  ))
                : null}
            </View>

            {/* Totales del día: tocar una tarjeta filtra la actividad. */}
            <View style={styles.vendido}>
              <Text style={styles.vendidoLabel}>VENDIDO HOY</Text>
              <Text style={styles.vendidoValor}>{formatMonto(resumen.vendido)}</Text>
              <Text style={styles.vendidoMeta}>Pedidos nuevos + cotizaciones aprobadas</Text>
            </View>

            <View style={styles.grid}>
              <Tile
                icono="map-marker-check"
                titulo="Visitas"
                valor={String(resumen.visitas)}
                sub={`${resumen.efectivas} efectivas · ${resumen.clientesVisitados} clientes`}
                activo={filtro === FILTROS.visitas}
                onPress={() => alternar(FILTROS.visitas)}
              />
              <Tile
                icono="cart-plus"
                titulo="Pedidos"
                valor={String(resumen.pedidos.length)}
                sub={formatMonto(resumen.suma(resumen.pedidos))}
                activo={filtro === ACTIVIDAD.pedido}
                onPress={() => alternar(ACTIVIDAD.pedido)}
              />
              <Tile
                icono="file-document-edit-outline"
                titulo="Cotizaciones"
                valor={String(resumen.cotizaciones.length)}
                sub={formatMonto(resumen.suma(resumen.cotizaciones))}
                activo={filtro === ACTIVIDAD.cotizacion}
                onPress={() => alternar(ACTIVIDAD.cotizacion)}
              />
              <Tile
                icono="file-check-outline"
                titulo="Aprobadas"
                valor={String(resumen.aprobaciones.length)}
                sub={formatMonto(resumen.suma(resumen.aprobaciones))}
                activo={filtro === ACTIVIDAD.aprobacion}
                onPress={() => alternar(ACTIVIDAD.aprobacion)}
              />
              <Tile
                icono="cash"
                titulo="Cobros"
                valor={formatMonto(resumen.suma(resumen.cobros))}
                sub={`${resumen.cobros.length} ${resumen.cobros.length === 1 ? 'recibo' : 'recibos'}`}
                activo={filtro === ACTIVIDAD.cobro}
                onPress={() => alternar(ACTIVIDAD.cobro)}
              />
              <Tile
                icono="library-shelves"
                titulo="Promocionales"
                valor={String(resumen.promocionales.length)}
                sub="solicitudes"
                activo={filtro === ACTIVIDAD.promocional}
                onPress={() => alternar(ACTIVIDAD.promocional)}
              />
            </View>

            {resumen.cobros.length ? (
              <View style={styles.formas}>
                <Text style={styles.seccion}>COBRADO POR FORMA DE PAGO</Text>
                {FORMAS.filter(([k]) => resumen.formas[k] > 0).map(([k, nombre]) => (
                  <View key={k} style={styles.formaFila}>
                    <Text style={styles.formaNombre}>{nombre}</Text>
                    <Text style={styles.formaMonto}>{formatMonto(resumen.formas[k])}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.actividadTop}>
              <Text style={styles.seccion}>
                {filtro === FILTROS.todo ? 'ACTIVIDAD DE HOY' : `ACTIVIDAD: ${TIPOS[filtro].titulo.toUpperCase()}`}
              </Text>
              {filtro !== FILTROS.todo ? (
                <Pressable onPress={() => setFiltro(FILTROS.todo)} hitSlop={6}>
                  <Text style={styles.link}>Ver todo</Text>
                </Pressable>
              ) : null}
            </View>
            {items.length ? (
              items.map((i) => <ItemCard key={`${i.tipo}|${i.clave ?? `${i.ruta}|${i.cliente}|${i.inicio}`}`} item={i} />)
            ) : (
              <View style={styles.empty}>
                <Feather name="sun" size={28} color={colors.textDisabled} />
                <Text style={styles.emptyText}>Todavía no hay actividad registrada hoy.</Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.lg },
  error: { fontSize: 13, color: colors.error },
  pressed: { opacity: 0.7 },
  link: { fontSize: 13, fontWeight: '700', color: colors.primary },
  seccion: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  diaTitulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  diaFecha: { fontSize: 12, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  avance: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  avanceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  avanceTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  avanceValor: { fontSize: 20, fontWeight: '800', color: colors.primary },
  barra: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  barraLlena: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.success },
  avanceMeta: { fontSize: 12, color: colors.textMuted },
  pendiente: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pendienteText: { flex: 1, fontSize: 12, color: colors.text },
  vendido: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  vendidoLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: colors.onPrimary, opacity: 0.85 },
  vendidoValor: { fontSize: 28, fontWeight: '800', color: colors.onPrimary, marginTop: 2 },
  vendidoMeta: { fontSize: 11, color: colors.onPrimary, opacity: 0.85 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 2,
  },
  tileActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileTitulo: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  tileValor: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  tileSub: { fontSize: 12, color: colors.textMuted },
  textoActivo: { color: colors.onPrimary },
  formas: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  formaFila: { flexDirection: 'row', justifyContent: 'space-between' },
  formaNombre: { fontSize: 13, color: colors.text },
  formaMonto: { fontSize: 13, fontWeight: '700', color: colors.text },
  actividadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  itemIcono: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  itemTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemCliente: { fontSize: 12, color: colors.text, marginTop: 1 },
  itemMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  itemDerecha: { alignItems: 'flex-end', gap: 2 },
  itemMonto: { fontSize: 15, fontWeight: '800', color: colors.text },
  itemHora: { fontSize: 11, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
