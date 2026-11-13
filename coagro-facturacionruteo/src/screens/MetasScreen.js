import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../components/ui/CenteredHeader';
import SearchBar from '../components/ui/SearchBar';
import SelectField from '../components/ui/SelectField';
import MetasInfoModal from '../components/metas/MetasInfoModal';
import TrofeoModal from '../components/metas/TrofeoModal';
import {
  AvanceGeneralCard,
  ESTADO_UI,
  EstadosChart,
  IncentivoCard,
  LineasChart,
  Premio,
  formatAvance,
} from '../components/metas/MetasGraficos';
import {
  ESTADOS_META,
  META_GLOBAL,
  desmarcarCelebradas,
  getCelebradas,
  getMetasPeriodo,
  getPeriodosMetas,
  getUltimaSyncMetas,
  getVendedorMetas,
  marcarCelebradas,
  totalesMetas,
} from '../repositories/metas';
import { formatCantidad, formatMonto } from '../utils/formato';
import { normalizar } from '../utils/text';
import { colors, radius, spacing } from '../theme';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const nombrePeriodo = (p) => (p ? `${MESES[p.mes - 1] ?? p.mes} ${p.anio}` : '');

// Campos de búsqueda.
const SEARCH_MODES = [
  { key: 'articulo', label: 'Artículo', icon: 'package' },
  { key: 'linea', label: 'Línea', icon: 'layers' },
  { key: 'proveedor', label: 'Proveedor', icon: 'truck' },
];
const textoBusqueda = {
  articulo: (m) => `${m.codigo} ${m.descripcion}`,
  linea: (m) => `${m.codLinea} ${m.linea}`,
  proveedor: (m) => `${m.codProveedor} ${m.proveedor}`,
};

const FILTROS_ESTADO = [
  { key: 'todas', label: 'Todas' },
  { key: ESTADOS_META.pendiente, label: 'Pendientes' },
  { key: ESTADOS_META.minimo, label: 'Mínimo' },
  { key: ESTADOS_META.cumplida, label: 'Cumplidas' },
];

// Encabezado: "BEATRIZ · VBV" (nombre del agente y código del ERP); sin datos, el subtítulo de siempre.
function subtituloVendedor(v) {
  const codigo = v?.vendedores?.join(', ');
  const nombre = v?.agentes?.map((a) => a.nombre).find(Boolean);
  if (nombre && codigo) return `${nombre} · ${codigo}`.toUpperCase();
  if (codigo) return `VENDEDOR ${codigo}`.toUpperCase();
  return undefined;
}

function formatFecha(iso) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nunca';
  return d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

// Celebración pendiente del periodo: solo el mes en curso (fecha del teléfono), metas con META > 0
// cumplidas que aún no se celebraron y la meta total del mes. Si hay algo, abre el TrofeoModal (abrir).
async function buscarCelebracion(periodo, lista, abrir) {
  const hoy = new Date();
  if (periodo.anio !== hoy.getFullYear() || periodo.mes !== hoy.getMonth() + 1) return;
  const ya = await getCelebradas(periodo.anio, periodo.mes);
  const cumplida = (m) => m.meta > 0 && m.estado === ESTADOS_META.cumplida;
  const t = totalesMetas(lista);
  const globalCumplida = t.avance != null && t.avance >= 100;

  // Celebradas que ya no están cumplidas (la meta cambió en la web, se quitó del periodo o bajó lo
  // vendido): se desmarcan para que la animación vuelva a salir cuando se cumplan de nuevo.
  const porCodigo = new Map(lista.map((m) => [m.codigo, m]));
  const vencidas = [...ya].filter((c) =>
    c === META_GLOBAL ? !globalCumplida : !porCodigo.has(c) || !cumplida(porCodigo.get(c))
  );
  if (vencidas.length) {
    await desmarcarCelebradas(periodo.anio, periodo.mes, vencidas);
    for (const c of vencidas) ya.delete(c);
  }

  const nuevas = lista.filter((m) => cumplida(m) && !ya.has(m.codigo));
  const global = globalCumplida && !ya.has(META_GLOBAL);
  if (nuevas.length || global) abrir({ periodo, metas: nuevas, global });
}

// Agrupa (ya ordenadas por línea, proveedor y artículo) en [{ linea, metas, proveedores: [{ proveedor, metas }] }].
function agrupar(metas) {
  const lineas = [];
  for (const m of metas) {
    let linea = lineas[lineas.length - 1];
    if (!linea || linea.linea !== m.linea) {
      linea = { linea: m.linea, metas: [], proveedores: [] };
      lineas.push(linea);
    }
    linea.metas.push(m);
    let prov = linea.proveedores[linea.proveedores.length - 1];
    if (!prov || prov.proveedor !== m.proveedor) {
      prov = { proveedor: m.proveedor, metas: [] };
      linea.proveedores.push(prov);
    }
    prov.metas.push(m);
  }
  return lineas;
}

function BarraAvance({ avance, color }) {
  const ancho = Math.max(0, Math.min(100, avance ?? 0));
  return (
    <View style={styles.barra}>
      <View style={[styles.barraRelleno, { width: `${ancho}%`, backgroundColor: color }]} />
    </View>
  );
}

// Card de una meta: premio (trofeo / medalla / medalla vacía), artículo, meta, mínimo, vendido,
// % de avance, estado e incentivo.
function MetaCard({ meta }) {
  const ui = ESTADO_UI[meta.estado];
  return (
    <View style={[styles.card, { borderLeftColor: ui.color }]}>
      <View style={styles.cardTop}>
        <Premio estado={meta.estado} size={20} />
        <View style={styles.cardTitulos}>
          <View style={styles.codeChip}>
            <Text style={styles.codeText}>{meta.codigo}</Text>
          </View>
          <Text style={styles.nombre} numberOfLines={2}>{meta.descripcion || meta.codigo}</Text>
        </View>
        <View style={[styles.estado, { backgroundColor: ui.fondo }]}>
          <Text style={[styles.estadoText, { color: ui.color }]}>{ui.uno}</Text>
        </View>
      </View>

      <View style={styles.cifras}>
        <View style={styles.cifra}>
          <Text style={styles.cifraLabel}>Meta</Text>
          <Text style={styles.cifraValor}>{formatCantidad(meta.meta)}</Text>
        </View>
        <View style={styles.cifra}>
          <Text style={styles.cifraLabel}>Mínimo</Text>
          <Text style={styles.cifraValor}>{formatCantidad(meta.minimo)}</Text>
        </View>
        <View style={styles.cifra}>
          <Text style={styles.cifraLabel}>Vendido</Text>
          <Text style={styles.cifraValor}>{formatCantidad(meta.vendido)}</Text>
        </View>
        <View style={styles.cifra}>
          <Text style={styles.cifraLabel}>Avance</Text>
          <Text style={[styles.cifraValor, { color: ui.color }]}>{formatAvance(meta.avance)}</Text>
        </View>
      </View>
      <BarraAvance avance={meta.avance} color={ui.color} />

      {meta.incentivo > 0 ? (
        <View style={styles.incentivoFila}>
          <MaterialCommunityIcons name="cash-multiple" size={16} color={colors.success} />
          <Text style={styles.incentivo}>
            Incentivo {formatMonto(meta.incentivo)} c/u · Ganado{' '}
            <Text style={styles.incentivoValor}>{formatMonto(meta.incentivoEstimado)}</Text>
            {meta.vendido < meta.meta ? ` · al cumplir ${formatMonto(meta.meta * meta.incentivo)}` : ''}
          </Text>
        </View>
      ) : (
        <Text style={styles.sinIncentivo}>Sin incentivo</Text>
      )}
    </View>
  );
}

// Grupo de una línea (plegable), con sus metas agrupadas por proveedor.
function LineaGrupo({ grupo, abierto, onToggle, onLayout }) {
  const t = totalesMetas(grupo.metas);
  return (
    <View style={styles.grupo} onLayout={onLayout}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.grupoHeader, pressed && styles.pressed]}>
        <View style={styles.grupoTexts}>
          <Text style={styles.grupoTitulo} numberOfLines={1}>{grupo.linea}</Text>
          <Text style={styles.grupoMeta} numberOfLines={1}>
            {formatCantidad(t.vendido)} / {formatCantidad(t.meta)} · {formatAvance(t.avance)} · {t.cumplidas}/{t.articulos} cumplidas
          </Text>
        </View>
        <Feather name={abierto ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {abierto
        ? grupo.proveedores.map((p) => (
            <View key={p.proveedor} style={styles.proveedor}>
              <View style={styles.proveedorHeader}>
                <Feather name="truck" size={12} color={colors.textMuted} />
                <Text style={styles.proveedorText} numberOfLines={1}>{p.proveedor}</Text>
              </View>
              {p.metas.map((m) => (
                <MetaCard key={m.id} meta={m} />
              ))}
            </View>
          ))
        : null}
    </View>
  );
}

// Metas: metas de venta por artículo del vendedor, agrupadas por línea y proveedor. Funciona sin
// conexión: solo lee la base local (las metas se descargan en Datos > Cargar datos) y lo vendido, los
// totales y los gráficos se calculan en el equipo con los pedidos y facturas guardados.
export default function MetasScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [periodos, setPeriodos] = useState([]);
  const [periodo, setPeriodo] = useState(null);
  const [metas, setMetas] = useState([]);
  const [ultimaSync, setUltimaSync] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [searchMode, setSearchMode] = useState(SEARCH_MODES[0].key);
  const [query, setQuery] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  // Líneas desplegadas (por nombre). Con búsqueda o filtro se despliegan todas.
  const [abiertas, setAbiertas] = useState(() => new Set());
  const scrollRef = useRef(null);
  // Posición (y) de cada grupo de línea en la lista, para ir a él desde el gráfico.
  const posiciones = useRef({});
  const [irA, setIrA] = useState(null);
  const [info, setInfo] = useState(false);
  // Vendedor del ERP de las metas (result.vendedores) y su nombre, para el encabezado.
  const [vendedor, setVendedor] = useState(null);
  // Celebración (TrofeoModal): metas recién cumplidas y si se cumplió la meta total del mes.
  const [celebrar, setCelebrar] = useState(null);

  // Lee los periodos guardados y elige el del mes actual del teléfono o, si no está, el más reciente.
  const leerPeriodos = useCallback(async () => {
    const lista = await getPeriodosMetas();
    setPeriodos(lista);
    setUltimaSync(await getUltimaSyncMetas());
    const hoy = new Date();
    setPeriodo(lista.find((p) => p.anio === hoy.getFullYear() && p.mes === hoy.getMonth() + 1) ?? lista[0] ?? null);
  }, []);

  useEffect(() => {
    leerPeriodos()
      .catch(() => setError('No se pudieron leer las metas de la base local.'))
      .finally(() => setCargando(false));
  }, [leerPeriodos]);

  useEffect(() => {
    let cancelado = false;
    getVendedorMetas(periodo?.anio, periodo?.mes)
      .then((v) => {
        if (!cancelado) setVendedor(v);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [periodo, ultimaSync]);

  useEffect(() => {
    if (!periodo) {
      setMetas([]);
      return undefined;
    }
    let cancelado = false;
    setCargando(true);
    getMetasPeriodo(periodo.anio, periodo.mes)
      .then((lista) => {
        if (cancelado) return;
        setMetas(lista);
        buscarCelebracion(periodo, lista, (c) => !cancelado && setCelebrar(c)).catch(() => {});
        // Con una sola línea se muestra desplegada.
        const lineas = [...new Set(lista.map((m) => m.linea))];
        setAbiertas(new Set(lineas.length === 1 ? lineas : []));
      })
      .catch(() => {
        if (!cancelado) setError('No se pudieron leer las metas de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [periodo]);

  const cerrarCelebracion = () => {
    if (celebrar) {
      const codigos = [...celebrar.metas.map((m) => m.codigo), ...(celebrar.global ? [META_GLOBAL] : [])];
      marcarCelebradas(celebrar.periodo.anio, celebrar.periodo.mes, codigos).catch(() => {});
    }
    setCelebrar(null);
  };

  const filtradas = useMemo(() => {
    const q = normalizar(query);
    return metas.filter(
      (m) =>
        (filtroEstado === 'todas' || m.estado === filtroEstado) &&
        (!q || normalizar(textoBusqueda[searchMode](m)).includes(q))
    );
  }, [metas, query, searchMode, filtroEstado]);

  const grupos = useMemo(() => agrupar(filtradas), [filtradas]);
  const todoAbierto = Boolean(normalizar(query)) || filtroEstado !== 'todas';

  const toggle = (linea) =>
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(linea)) next.delete(linea);
      else next.add(linea);
      return next;
    });

  const opcionesPeriodo = periodos.map(nombrePeriodo);

  // Cambió el mes y el equipo no tiene sus metas (p. ej. sin conexión el día 1): se avisa en vez de
  // mostrar el mes anterior como si fuera el actual.
  const hoy = new Date();
  const mesActual = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  const mesSinDescargar =
    periodos.length && !periodos.some((p) => p.anio === mesActual.anio && p.mes === mesActual.mes) &&
    periodos.every((p) => p.anio * 12 + p.mes < mesActual.anio * 12 + mesActual.mes)
      ? mesActual
      : null;

  // Tocar una línea del gráfico: se despliega y se baja hasta ella (al terminar de dibujarse).
  const verLinea = (linea) => {
    setAbiertas((prev) => new Set(prev).add(linea));
    setIrA(linea);
  };
  const alDibujarGrupo = (linea) => (e) => {
    posiciones.current[linea] = e.nativeEvent.layout.y;
    if (irA === linea) {
      scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - spacing.sm), animated: true });
      setIrA(null);
    }
  };
  useEffect(() => {
    if (irA && posiciones.current[irA] != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, posiciones.current[irA] - spacing.sm), animated: true });
    }
  }, [irA]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Metas" subtitle={subtituloVendedor(vendedor)} onBack={onBack} onInfo={() => setInfo(true)} />

      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.periodoRow}>
          <View style={styles.periodoBox}>
            <Text style={styles.periodoLabel}>PERIODO</Text>
            {periodos.length > 1 ? (
              <SelectField
                label=""
                value={nombrePeriodo(periodo)}
                options={opcionesPeriodo}
                onChange={(texto) => setPeriodo(periodos[opcionesPeriodo.indexOf(texto)] ?? null)}
              />
            ) : (
              <Text style={styles.periodoValor}>{periodo ? nombrePeriodo(periodo) : 'Sin metas descargadas'}</Text>
            )}
          </View>
        </View>
        <Text style={styles.syncInfo}>Última descarga: {formatFecha(ultimaSync)}</Text>

        {mesSinDescargar ? (
          <View style={styles.offline}>
            <Feather name="alert-circle" size={16} color={colors.warning} />
            <Text style={styles.offlineText}>
              Aún no hay metas de {nombrePeriodo(mesSinDescargar)} en el equipo. Se muestra {nombrePeriodo(periodo)}.
              Descárgalas en Datos &gt; Cargar datos cuando tengas conexión.
            </Text>
          </View>
        ) : null}
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : !metas.length ? (
          <View style={styles.empty}>
            <Feather name="target" size={32} color={colors.textDisabled} />
            <Text style={styles.emptyText}>
              {periodo ? 'Sin metas para este periodo' : 'Aún no hay metas en el equipo. Descárgalas en Datos > Cargar datos.'}
            </Text>
          </View>
        ) : (
          <>
            <AvanceGeneralCard metas={metas} periodo={periodo} />
            <IncentivoCard metas={metas} />
            <EstadosChart metas={metas} filtro={filtroEstado} onFiltro={setFiltroEstado} />
            <LineasChart metas={metas} onLinea={verLinea} seleccionada={irA} />

            <Text style={styles.seccion}>Detalle por artículo</Text>

            <SearchBar
              modes={SEARCH_MODES}
              mode={searchMode}
              onModeChange={setSearchMode}
              query={query}
              onQueryChange={setQuery}
            />

            <View style={styles.chips}>
              {FILTROS_ESTADO.map((f) => (
                <Pressable
                  key={f.key}
                  onPress={() => setFiltroEstado(f.key)}
                  style={[styles.chip, filtroEstado === f.key && styles.chipActivo]}
                >
                  <Text style={[styles.chipText, filtroEstado === f.key && styles.chipTextActivo]}>{f.label}</Text>
                </Pressable>
              ))}
            </View>

            {grupos.length ? (
              grupos.map((g) => (
                <LineaGrupo
                  key={g.linea}
                  grupo={g}
                  abierto={todoAbierto || abiertas.has(g.linea)}
                  onToggle={() => toggle(g.linea)}
                  onLayout={alDibujarGrupo(g.linea)}
                />
              ))
            ) : (
              <View style={styles.empty}>
                <Feather name="search" size={28} color={colors.textDisabled} />
                <Text style={styles.emptyText}>No hay metas que coincidan con la búsqueda</Text>
              </View>
            )}

            <Text style={styles.nota}>
              Lo vendido se calcula con los pedidos y facturas del mes guardados en el equipo (sin bonificaciones
              ni anulados). Actualízalos con Datos &gt; Cargar datos.
            </Text>
          </>
        )}
      </ScrollView>

      <TrofeoModal
        visible={Boolean(celebrar)}
        metas={celebrar?.metas ?? []}
        global={celebrar?.global ?? false}
        periodoTexto={celebrar ? nombrePeriodo(celebrar.periodo) : ''}
        onClose={cerrarCelebracion}
      />

      <MetasInfoModal
        visible={info}
        onClose={() => setInfo(false)}
        periodo={periodo}
        nombrePeriodo={nombrePeriodo}
        ultimaSync={formatFecha(ultimaSync)}
      />
    </View>
  );
}

const sombra = {
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  pressed: { opacity: 0.7 },
  periodoRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  periodoBox: { flex: 1, gap: 4 },
  periodoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  periodoValor: { fontSize: 18, fontWeight: '800', color: colors.text },
  syncInfo: { fontSize: 12, color: colors.textMuted, marginTop: -spacing.sm },
  offline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
  },
  offlineText: { flex: 1, fontSize: 13, color: colors.textMuted },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: { marginTop: spacing.lg },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  barra: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: radius.pill },
  seccion: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 5,
  },
  chipActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chipTextActivo: { color: colors.onPrimary },
  grupo: { gap: spacing.sm },
  grupoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.sm + 4,
  },
  grupoTexts: { flex: 1 },
  grupoTitulo: { fontSize: 15, fontWeight: '800', color: colors.text },
  grupoMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  proveedor: { gap: spacing.sm, paddingLeft: spacing.sm },
  proveedorHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proveedorText: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
    gap: 6,
    ...sombra,
  },
  cardTitulos: { flex: 1, gap: 3 },
  incentivoFila: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sinIncentivo: { fontSize: 12, color: colors.textDisabled },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  codeChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  codeText: { fontSize: 12, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  estado: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  estadoText: { fontSize: 11, fontWeight: '700' },
  nombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  cifras: { flexDirection: 'row' },
  cifra: { flex: 1 },
  cifraLabel: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  cifraValor: { fontSize: 15, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  incentivo: { flex: 1, fontSize: 12, color: colors.textMuted },
  incentivoValor: { fontWeight: '800', color: colors.success },
  nota: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
