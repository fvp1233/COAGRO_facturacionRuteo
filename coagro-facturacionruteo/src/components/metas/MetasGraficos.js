import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { ESTADOS_META, totalesMetas } from '../../repositories/metas';
import { formatCantidad, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Gráficos de "Mis metas" dibujados con View (la app no tiene librería de gráficos/SVG).

// Oro del trofeo y bronce de la medalla (premios); el resto sale del tema.
export const ORO = '#E0A100';
const BRONCE = '#B8702E';

// Color, fondo, premio (ícono de MaterialCommunityIcons y su color) y texto de cada estado. El color
// siempre va con texto/ícono, nunca solo. Cumplida = trofeo; mínimo = medalla; pendiente = medalla vacía.
export const ESTADO_UI = {
  [ESTADOS_META.cumplida]: {
    texto: 'Cumplidas', uno: 'Cumplida', color: colors.success, fondo: '#DDF0EF', icono: 'trophy', iconoColor: ORO,
  },
  [ESTADOS_META.minimo]: {
    texto: 'Mínimo', uno: 'Mínimo alcanzado', color: colors.warning, fondo: '#FDEBD3', icono: 'medal', iconoColor: BRONCE,
  },
  [ESTADOS_META.pendiente]: {
    texto: 'Pendientes', uno: 'Pendiente', color: colors.primary, fondo: colors.primarySoft, icono: 'medal-outline', iconoColor: colors.textDisabled,
  },
};

// Premio de un estado: trofeo, medalla o medalla vacía, en un círculo.
export function Premio({ estado, size = 18, fondo = true }) {
  const ui = ESTADO_UI[estado];
  const icono = <MaterialCommunityIcons name={ui.icono} size={size} color={ui.iconoColor} />;
  if (!fondo) return icono;
  return (
    <View style={[styles.premio, { width: size + 14, height: size + 14, backgroundColor: estado === ESTADOS_META.cumplida ? '#FFF4D6' : colors.surface }]}>
      {icono}
    </View>
  );
}
const ORDEN_ESTADOS = [ESTADOS_META.cumplida, ESTADOS_META.minimo, ESTADOS_META.pendiente];

export const formatAvance = (avance) => (avance == null ? '-' : `${formatCantidad(Math.round(avance * 10) / 10)}%`);
const pct = (v) => `${Math.max(0, Math.min(100, v ?? 0))}%`;

// Ritmo del mes del periodo según la fecha del teléfono:
//   { transcurrido (0..1), dia, dias, restantes, estado: 'actual' | 'cerrado' | 'futuro' }.
export function ritmoPeriodo(periodo, hoy = new Date()) {
  if (!periodo) return null;
  const dias = new Date(periodo.anio, periodo.mes, 0).getDate();
  const actual = periodo.anio * 12 + periodo.mes;
  const ahora = hoy.getFullYear() * 12 + hoy.getMonth() + 1;
  if (actual < ahora) return { transcurrido: 1, dia: dias, dias, restantes: 0, estado: 'cerrado' };
  if (actual > ahora) return { transcurrido: 0, dia: 0, dias, restantes: dias, estado: 'futuro' };
  const dia = hoy.getDate();
  return { transcurrido: dia / dias, dia, dias, restantes: dias - dia, estado: 'actual' };
}

// Avance general: % grande, barra con la marca del ritmo esperado (día del mes) y proyección al
// cierre si se sigue vendiendo al mismo ritmo.
export function AvanceGeneralCard({ metas, periodo }) {
  const t = totalesMetas(metas);
  const ritmo = ritmoPeriodo(periodo);
  const esperado = ritmo ? ritmo.transcurrido * 100 : null;
  const diferencia = t.avance != null && esperado != null ? t.avance - esperado : null;
  const proyeccion =
    ritmo?.estado === 'actual' && t.avance != null && ritmo.transcurrido > 0 ? t.avance / ritmo.transcurrido : null;
  const alDia = diferencia != null && diferencia >= 0;
  const colorBarra = t.avance != null && t.avance >= 100 ? colors.success : alDia ? colors.success : colors.primary;

  let mensaje = null;
  if (t.avance == null) mensaje = 'Las metas del periodo están en 0.';
  else if (ritmo?.estado === 'cerrado') mensaje = t.avance >= 100 ? 'Mes cerrado: meta cumplida.' : 'Mes cerrado.';
  else if (ritmo?.estado === 'futuro') mensaje = 'El periodo aún no empieza.';
  else if (t.avance >= 100) mensaje = '¡Meta del mes cumplida!';
  else if (diferencia != null)
    mensaje = alDia
      ? `Vas ${formatCantidad(Math.round(diferencia))} pts adelante del ritmo del mes.`
      : `Vas ${formatCantidad(Math.round(-diferencia))} pts atrás del ritmo del mes.`;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>¿Cómo voy?</Text>

      <View style={styles.heroRow}>
        {t.avance != null && t.avance >= 100 ? <MaterialCommunityIcons name="trophy" size={34} color={ORO} /> : null}
        <Text style={styles.hero}>{formatAvance(t.avance)}</Text>
        <Text style={styles.heroSub}>
          {formatCantidad(t.vendido)} de {formatCantidad(t.meta)} unidades
        </Text>
      </View>

      {/* Barra de avance (tope visual 100%) con la marca del ritmo esperado a hoy. */}
      <View style={styles.trackWrap}>
        <View style={styles.trackGrande}>
          <View style={[styles.relleno, { width: pct(t.avance), backgroundColor: colorBarra }]} />
        </View>
        {ritmo?.estado === 'actual' ? (
          <View style={[styles.marca, { left: pct(esperado) }]}>
            <View style={styles.marcaLinea} />
          </View>
        ) : null}
      </View>
      {ritmo?.estado === 'actual' ? (
        <View style={styles.leyendaRitmo}>
          <View style={styles.marcaMini} />
          <Text style={styles.leyendaText}>
            Ritmo esperado hoy: {formatAvance(esperado)} (día {ritmo.dia} de {ritmo.dias})
          </Text>
        </View>
      ) : null}

      {mensaje ? (
        <View style={[styles.mensaje, { backgroundColor: alDia || t.avance >= 100 ? '#DDF0EF' : colors.surface }]}>
          <Feather
            name={alDia || t.avance >= 100 ? 'trending-up' : 'trending-down'}
            size={16}
            color={alDia || t.avance >= 100 ? colors.success : colors.primary}
          />
          <Text style={styles.mensajeText}>{mensaje}</Text>
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat
          label="Trofeos"
          valor={`${t.cumplidas}/${t.articulos}`}
          icono={<MaterialCommunityIcons name="trophy" size={15} color={ORO} />}
        />
        <Stat label="Proyección al cierre" valor={proyeccion != null ? formatAvance(proyeccion) : '-'} />
        <Stat label="Días restantes" valor={ritmo ? String(ritmo.restantes) : '-'} />
      </View>
    </View>
  );
}

function Stat({ label, valor, icono }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statFila}>
        {icono}
        <Text style={styles.statValor}>{valor}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Incentivo del periodo: lo ganado con lo vendido (Σ vendido × incentivo por unidad), lo que se
// ganaría al cumplir todas las metas con incentivo y una barra de lo ganado contra ese total.
export function IncentivoCard({ metas }) {
  const t = totalesMetas(metas);
  if (!t.conIncentivo) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitulo}>Incentivo</Text>
        <View style={styles.incentivoVacio}>
          <MaterialCommunityIcons name="cash-remove" size={20} color={colors.textDisabled} />
          <Text style={styles.leyendaText}>Las metas de este periodo no tienen incentivo.</Text>
        </View>
      </View>
    );
  }
  const avance = t.incentivoMeta > 0 ? (t.incentivo / t.incentivoMeta) * 100 : null;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>Incentivo</Text>
      <View style={styles.incentivoFila}>
        <View style={styles.incentivoIcono}>
          <MaterialCommunityIcons name="cash-multiple" size={24} color={colors.success} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.incentivoLabel}>Ganado hasta hoy</Text>
          <Text style={styles.incentivoValor}>{formatMonto(t.incentivo)}</Text>
        </View>
        <View style={styles.incentivoDerecha}>
          <Text style={styles.incentivoLabel}>Si cumples todo</Text>
          <Text style={styles.incentivoMeta}>{formatMonto(t.incentivoMeta)}</Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.relleno, { width: pct(avance), backgroundColor: colors.success }]} />
      </View>
      <Text style={styles.leyendaText}>
        {t.conIncentivo} {t.conIncentivo === 1 ? 'artículo tiene' : 'artículos tienen'} incentivo por unidad vendida
        {t.incentivo < t.incentivoMeta ? ` · te faltan ${formatMonto(t.incentivoMeta - t.incentivo)}` : ''}.
      </Text>
    </View>
  );
}

// Artículos por estado: barra segmentada + leyenda con conteos. Tocar un estado lo filtra.
export function EstadosChart({ metas, filtro, onFiltro }) {
  const total = metas.length;
  const conteo = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, metas.filter((m) => m.estado === e).length]));
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>Artículos por estado</Text>
      <View style={styles.segmentos}>
        {ORDEN_ESTADOS.filter((e) => conteo[e] > 0).map((e) => (
          <View key={e} style={[styles.segmento, { flex: conteo[e], backgroundColor: ESTADO_UI[e].color }]} />
        ))}
      </View>
      <View style={styles.leyenda}>
        {ORDEN_ESTADOS.map((e) => {
          const ui = ESTADO_UI[e];
          const activo = filtro === e;
          return (
            <Pressable
              key={e}
              onPress={() => onFiltro?.(activo ? 'todas' : e)}
              hitSlop={6}
              style={({ pressed }) => [styles.leyendaItem, activo && { backgroundColor: ui.fondo }, pressed && styles.pressed]}
            >
              <Premio estado={e} size={16} />
              <Text style={styles.leyendaValor}>{conteo[e]}</Text>
              <Text style={styles.leyendaLabel}>
                {ui.texto} · {total ? Math.round((conteo[e] / total) * 100) : 0}%
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Avance por línea: barras horizontales (% vendido / meta) ordenadas de menor a mayor avance, con
// una guía en 100%. Tocar una línea la abre en la lista de abajo.
export function LineasChart({ metas, onLinea, seleccionada }) {
  const lineas = [];
  const porLinea = new Map();
  for (const m of metas) {
    if (!porLinea.has(m.linea)) {
      porLinea.set(m.linea, []);
      lineas.push(m.linea);
    }
    porLinea.get(m.linea).push(m);
  }
  const filas = lineas
    .map((linea) => ({ linea, ...totalesMetas(porLinea.get(linea)) }))
    .sort((a, b) => (a.avance ?? -1) - (b.avance ?? -1));
  // Escala: hasta el mayor avance (mínimo 100%) para que lo pasado de 100% también se vea.
  const maximo = Math.max(100, ...filas.map((f) => f.avance ?? 0));
  const guia = (100 / maximo) * 100;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitulo}>Avance por línea</Text>
      {filas.map((f) => {
        const color = f.avance != null && f.avance >= 100 ? colors.success : colors.primary;
        const activa = seleccionada === f.linea;
        return (
          <Pressable
            key={f.linea}
            onPress={() => onLinea?.(f.linea)}
            style={({ pressed }) => [styles.lineaFila, activa && styles.lineaActiva, pressed && styles.pressed]}
          >
            <View style={styles.lineaTop}>
              <Text style={styles.lineaNombre} numberOfLines={1}>{f.linea}</Text>
              <Text style={styles.lineaValor}>{formatAvance(f.avance)}</Text>
            </View>
            <View style={styles.trackWrap}>
              <View style={styles.track}>
                <View style={[styles.relleno, { width: pct(((f.avance ?? 0) / maximo) * 100), backgroundColor: color }]} />
              </View>
              {maximo > 100 ? <View style={[styles.guia, { left: pct(guia) }]} /> : null}
            </View>
            <Text style={styles.lineaDetalle}>
              {formatCantidad(f.vendido)} / {formatCantidad(f.meta)} unid. · {f.cumplidas}/{f.articulos} cumplidas
            </Text>
          </Pressable>
        );
      })}
      {maximo > 100 ? <Text style={styles.nota}>La línea gris marca el 100% de la meta.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTitulo: { fontSize: 13, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  pressed: { opacity: 0.7 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  hero: { fontSize: 40, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 13, color: colors.textMuted },
  trackWrap: { justifyContent: 'center' },
  trackGrande: { height: 14, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  relleno: { height: '100%', borderRadius: radius.pill },
  marca: { position: 'absolute', top: -4, bottom: -4, width: 2, marginLeft: -1 },
  marcaLinea: { flex: 1, width: 2, backgroundColor: colors.text, borderRadius: 1 },
  marcaMini: { width: 2, height: 12, backgroundColor: colors.text, borderRadius: 1 },
  guia: { position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, backgroundColor: colors.textDisabled },
  leyendaRitmo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leyendaText: { fontSize: 12, color: colors.textMuted },
  mensaje: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.sm, padding: spacing.sm },
  mensajeText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.surface, paddingTop: spacing.sm },
  stat: { flex: 1, alignItems: 'center' },
  statFila: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  premio: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  incentivoVacio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  incentivoFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  incentivoIcono: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: '#DDF0EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incentivoLabel: { fontSize: 11, color: colors.textMuted },
  incentivoValor: { fontSize: 24, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  incentivoDerecha: { alignItems: 'flex-end' },
  incentivoMeta: { fontSize: 16, fontWeight: '800', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  statValor: { fontSize: 17, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  segmentos: { flexDirection: 'row', height: 18, gap: 2, borderRadius: radius.sm, overflow: 'hidden' },
  segmento: { height: '100%' },
  leyenda: { gap: 2 },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
  },
  leyendaValor: { fontSize: 15, fontWeight: '800', color: colors.text, minWidth: 24, fontVariant: ['tabular-nums'] },
  leyendaLabel: { fontSize: 13, color: colors.textMuted },
  lineaFila: { gap: 5, borderRadius: radius.sm, padding: spacing.xs },
  lineaActiva: { backgroundColor: colors.surface },
  lineaTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  lineaNombre: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  lineaValor: { fontSize: 14, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] },
  lineaDetalle: { fontSize: 11, color: colors.textMuted },
  nota: { fontSize: 11, color: colors.textMuted },
});
