import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../components/ui/CenteredHeader';
import { getVencimientos } from '../repositories/cobros';
import { formatMonto, formatVendedor } from '../utils/formato';
import { colors, radius, spacing } from '../theme';

const ACCENT = colors.primary;
const VENCIDO = colors.error;
const POR_VENCER = colors.warning;
const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
// Vistas del calendario: todos los documentos del equipo o solo los del agente (vendedor) del usuario.
const VISTAS = [
  { id: 'todos', label: 'Todos los documentos' },
  { id: 'mios', label: 'Mis documentos vencidos' },
];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Fechas como 'YYYY-MM-DD' en hora local (igual que FEC_VEN), para comparar como texto.
const pad = (n) => String(n).padStart(2, '0');
const claveFecha = (anio, mes, dia) => `${anio}-${pad(mes + 1)}-${pad(dia)}`;
const hoyClave = () => {
  const d = new Date();
  return claveFecha(d.getFullYear(), d.getMonth(), d.getDate());
};

// Celdas del mes (semana de lunes a domingo); null = hueco antes del día 1 o después del último.
function celdasMes(anio, mes) {
  const primerDia = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  const celdas = Array(primerDia).fill(null);
  for (let d = 1; d <= totalDias; d += 1) celdas.push(d);
  while (celdas.length % 7) celdas.push(null);
  return celdas;
}

function tituloDia(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Módulo Calendario: vencimientos de los documentos pendientes de cobro (alCXC_PEN_COB, descargados
// con Datos > Cargar datos). El mes marca los días con vencimientos (rojo = ya vencido, ámbar = por
// vencer); al tocar un día se listan sus documentos con el cliente, el número y el saldo.
// Arriba se elige la vista: todos los documentos o solo los que le toca cobrar al usuario.
export default function CalendarioScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const hoy = hoyClave();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() };
  });
  const [seleccionado, setSeleccionado] = useState(hoy);
  const [vista, setVista] = useState('todos');
  const [documentos, setDocumentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError('');
    setDocumentos([]);
    getVencimientos({ soloAgente: vista === 'mios' })
      .then((lista) => {
        if (!cancelado) setDocumentos(lista);
      })
      .catch(() => {
        if (!cancelado) setError('No se pudieron leer los documentos de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [vista]);

  // Documentos agrupados por fecha de vencimiento.
  const porDia = useMemo(() => {
    const mapa = {};
    documentos.forEach((d) => {
      (mapa[d.vence] ??= []).push(d);
    });
    return mapa;
  }, [documentos]);

  const celdas = celdasMes(mes.anio, mes.mes);
  const delDia = porDia[seleccionado] ?? [];
  const totalDia = delDia.reduce((suma, d) => suma + Number(d.saldoLocal ?? 0), 0);
  const vencidos = documentos.filter((d) => d.vence < hoy);

  const moverMes = (delta) => {
    setMes(({ anio, mes: m }) => {
      const d = new Date(anio, m + delta, 1);
      return { anio: d.getFullYear(), mes: d.getMonth() };
    });
  };

  const irAHoy = () => {
    const d = new Date();
    setMes({ anio: d.getFullYear(), mes: d.getMonth() });
    setSeleccionado(hoy);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Calendario" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.segment}>
          {VISTAS.map((v) => {
            const activa = v.id === vista;
            return (
              <Pressable
                key={v.id}
                onPress={() => setVista(v.id)}
                style={[styles.segmentItem, activa && styles.segmentItemActive]}
              >
                <Text style={[styles.segmentText, activa && styles.segmentTextActive]} numberOfLines={1}>
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <MaterialCommunityIcons name="calendar-alert" size={22} color={ACCENT} />
          </View>
          <View style={styles.summaryTexts}>
            <Text style={styles.summaryTitle}>
              {vista === 'mios' ? 'Mis documentos por cobrar' : 'Vencimientos de documentos'}
            </Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {vencidos.length} vencidos · {formatMonto(vencidos.reduce((s, d) => s + Number(d.saldoLocal ?? 0), 0))}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.monthBar}>
            <Pressable onPress={() => moverMes(-1)} hitSlop={10} style={styles.monthButton}>
              <Feather name="chevron-left" size={22} color={colors.text} />
            </Pressable>
            <Text style={styles.monthTitle}>{MESES[mes.mes]} {mes.anio}</Text>
            <Pressable onPress={() => moverMes(1)} hitSlop={10} style={styles.monthButton}>
              <Feather name="chevron-right" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.week}>
            {DIAS_SEMANA.map((d, i) => (
              <Text key={i} style={styles.weekDay}>{d}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {celdas.map((dia, i) => {
              if (!dia) return <View key={i} style={styles.dayCell} />;
              const clave = claveFecha(mes.anio, mes.mes, dia);
              const tiene = !!porDia[clave];
              const activo = clave === seleccionado;
              const esHoy = clave === hoy;
              return (
                <Pressable key={i} style={styles.dayCell} onPress={() => setSeleccionado(clave)}>
                  <View style={[styles.dayCircle, esHoy && styles.dayToday, activo && styles.daySelected]}>
                    <Text style={[styles.dayText, esHoy && styles.dayTextToday, activo && styles.dayTextSelected]}>
                      {dia}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.dot,
                      tiene && { backgroundColor: clave < hoy ? VENCIDO : POR_VENCER },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: VENCIDO }]} />
              <Text style={styles.legendText}>Vencido</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: POR_VENCER }]} />
              <Text style={styles.legendText}>Por vencer</Text>
            </View>
            <Pressable onPress={irAHoy} hitSlop={8} style={styles.todayButton}>
              <Text style={styles.todayText}>Hoy</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.dayHeader}>
          <View style={styles.dayHeaderTexts}>
            <Text style={styles.dayTitle}>{tituloDia(seleccionado)}</Text>
            <Text style={styles.dayMeta}>
              {delDia.length} {delDia.length === 1 ? 'documento' : 'documentos'}
              {seleccionado < hoy && delDia.length ? ' vencidos' : ''}
            </Text>
          </View>
          <View style={styles.totalChip}>
            <Text style={styles.totalLabel}>Saldo total</Text>
            <Text style={styles.totalValue}>{formatMonto(totalDia)}</Text>
          </View>
        </View>

        {cargando ? <ActivityIndicator color={ACCENT} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!cargando && !error && !delDia.length ? (
          <Text style={styles.empty}>No hay documentos que venzan este día.</Text>
        ) : null}

        {delDia.map((d) => (
          <View key={d.clave} style={styles.item}>
            <View style={[styles.itemBar, { backgroundColor: d.vence < hoy ? VENCIDO : POR_VENCER }]} />
            <View style={styles.itemTexts}>
              <Text style={styles.itemName} numberOfLines={2}>{d.nombre}</Text>
              <Text style={styles.itemMeta}>
                {d.tipo ? `${d.tipo} ` : ''}{d.documento}
              </Text>
              <Text style={styles.itemMeta} numberOfLines={1}>Ruta {d.ruta}</Text>
              <View style={styles.itemAgent}>
                <Feather name="user" size={12} color={colors.textMuted} />
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {formatVendedor(d)}
                </Text>
              </View>
            </View>
            <Text style={styles.itemAmount}>{formatMonto(d.saldoLocal)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
  },
  segmentItemActive: { backgroundColor: ACCENT },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.onPrimary },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTexts: { flex: 1 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  summaryMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  monthButton: { padding: spacing.xs },
  monthTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  week: { flexDirection: 'row' },
  weekDay: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: { borderWidth: 1.5, borderColor: ACCENT },
  daySelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  dayText: { fontSize: 14, color: colors.text },
  dayTextToday: { color: ACCENT, fontWeight: '700' },
  dayTextSelected: { color: colors.onPrimary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: radius.pill, marginTop: 2 },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: radius.pill },
  legendText: { fontSize: 12, color: colors.textMuted },
  todayButton: {
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayText: { fontSize: 13, fontWeight: '600', color: ACCENT },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayHeaderTexts: { flex: 1 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  dayMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  totalChip: {
    alignItems: 'flex-end',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  totalLabel: { fontSize: 11, color: colors.primaryDark },
  totalValue: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  error: { fontSize: 12, color: colors.error },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingRight: spacing.md,
    gap: spacing.sm + 4,
    overflow: 'hidden',
  },
  itemBar: { width: 4, alignSelf: 'stretch' },
  itemTexts: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemMeta: { fontSize: 12, color: colors.textMuted },
  itemAgent: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  itemAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
});
