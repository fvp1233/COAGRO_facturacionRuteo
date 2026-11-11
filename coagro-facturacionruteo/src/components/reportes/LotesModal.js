import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { getLotesArticulo } from '../../repositories/articulos';
import { formatCantidad, formatFechaDoc } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

// Días antes del vencimiento en que el lote se marca como "por vencer".
const DIAS_POR_VENCER = 30;

const pad = (n) => String(n).padStart(2, '0');
// Fecha local como 'YYYY-MM-DD' (igual que FECHA_VENCIMIENTO) para comparar como texto.
const claveFecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Vencido (rojo), por vencer (ámbar) o vigente.
function estadoLote(vence, hoy, limite) {
  const dia = String(vence ?? '').slice(0, 10);
  if (!dia) return null;
  if (dia < hoy) return 'vencido';
  if (dia <= limite) return 'porVencer';
  return null;
}

// Color de la línea izquierda y del texto según el estado del lote.
const ESTADO = {
  vencido: { label: 'VENCIDO', color: colors.primary },
  porVencer: { label: 'POR VENCER', color: colors.warning },
};

// Card de un lote: número de lote y vencimiento a la izquierda, existencia a la derecha.
function LoteCard({ lote }) {
  const estado = ESTADO[lote.estado];
  return (
    <View style={[styles.card, { borderLeftColor: estado?.color ?? colors.success }]}>
      <View style={styles.cardBody}>
        <Text style={styles.loteNombre} numberOfLines={1}>{lote.lote || 'Sin lote'}</Text>
        <View style={styles.meta}>
          <Feather name="calendar" size={12} color={estado ? styles[lote.estado].color : colors.textMuted} />
          <Text style={[styles.fecha, estado && styles[lote.estado]]}>
            Vence {formatFechaDoc(lote.vence) || '—'}
          </Text>
          {estado ? <Text style={[styles.estado, styles[lote.estado]]}>· {estado.label}</Text> : null}
        </View>
      </View>
      <Text style={styles.qty}>{formatCantidad(lote.existencia)}</Text>
    </View>
  );
}

// Popup con los lotes del artículo en la bodega del ERP de la ruta (base local).
// articulo: { codigo, descripcion } o null (cerrado). ruta: ruta activa (bodegaErp).
export default function LotesModal({ articulo, ruta, onClose }) {
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!articulo) return undefined;
    let cancelado = false;
    setCargando(true);
    setError('');
    setLotes([]);
    const ahora = new Date();
    const hoy = claveFecha(ahora);
    const limite = claveFecha(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + DIAS_POR_VENCER));
    getLotesArticulo(ruta, articulo.codigo)
      .then((lista) => {
        if (!cancelado) setLotes(lista.map((l) => ({ ...l, estado: estadoLote(l.vence, hoy, limite) })));
      })
      .catch(() => {
        if (!cancelado) setError('No se pudieron leer los lotes de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [articulo, ruta]);

  const total = lotes.reduce((s, l) => s + Number(l.existencia ?? 0), 0);

  return (
    <Modal visible={!!articulo} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* El fondo cierra el popup; va aparte para no quitarle el desplazamiento a la tabla. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTexts}>
              <Text style={styles.title}>Lotes del artículo</Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                {articulo?.codigo} · {articulo?.descripcion}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {cargando ? (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            ) : (
              lotes.length ? (
                lotes.map((l) => <LoteCard key={`${l.lote}|${l.vence}`} lote={l} />)
              ) : (
                <Text style={styles.empty}>El artículo no tiene lotes en la bodega de la ruta</Text>
              )
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          {!cargando && lotes.length ? (
            <View style={styles.footer}>
              <Text style={styles.footerLabel}>
                {lotes.length} {lotes.length === 1 ? 'lote' : 'lotes'} · Bodega {ruta?.bodegaErp ?? '—'}
              </Text>
              <Text style={styles.footerTotal}>{formatCantidad(total)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  cardBody: { flex: 1, gap: 3 },
  loteNombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTexts: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexShrink: 1 },
  content: { padding: spacing.md, gap: spacing.sm },
  loading: { marginVertical: spacing.lg },
  error: { fontSize: 12, color: colors.error },
  fecha: { fontSize: 13, color: colors.text },
  estado: { fontSize: 11, fontWeight: '700' },
  vencido: { color: colors.error },
  porVencer: { color: colors.warning },
  qty: {
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerLabel: { fontSize: 13, color: colors.textMuted },
  footerTotal: { fontSize: 16, fontWeight: '800', color: colors.text },
});
