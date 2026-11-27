import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// Botón de la derecha: por defecto el ícono de información. Al tocarlo:
//   - onInfo, si la pantalla tiene su propia ayuda (p. ej. Metas);
//   - si no, info (texto breve de qué hace la pantalla) en una ventanita.
// Sin onInfo ni info, el ícono no se muestra. Con onRight se usa en su lugar rightIcon (nombre de
// Feather, p. ej. 'edit-2') con rightColor; rightIcon null lo deja vacío.
export default function CenteredHeader({
  title,
  subtitle = 'COAGRO FACTURACIÓN',
  onBack,
  onInfo,
  info,
  onRight,
  rightIcon,
  rightColor = colors.text,
}) {
  const [verInfo, setVerInfo] = useState(false);
  const tieneInfo = Boolean(onInfo || info);

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.side}>
        <Feather name="chevron-left" size={28} color={colors.text} />
      </Pressable>

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.subtitleRow}>
          <View style={styles.dot} />
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      {onRight ? (
        <Pressable onPress={rightIcon ? onRight : undefined} hitSlop={10} style={[styles.side, styles.sideRight]}>
          {rightIcon ? <Feather name={rightIcon} size={22} color={rightColor} /> : null}
        </Pressable>
      ) : (
        <Pressable
          onPress={tieneInfo ? onInfo ?? (() => setVerInfo(true)) : undefined}
          hitSlop={10}
          style={[styles.side, styles.sideRight]}
        >
          {tieneInfo ? <Feather name="info" size={22} color={colors.text} /> : null}
        </Pressable>
      )}

      {info && !onInfo ? (
        <Modal visible={verInfo} transparent animationType="fade" onRequestClose={() => setVerInfo(false)}>
          <Pressable style={styles.backdrop} onPress={() => setVerInfo(false)}>
            <Pressable style={styles.card} onPress={() => {}}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIcono}>
                  <Feather name="info" size={18} color={colors.primary} />
                </View>
                <Text style={styles.cardTitulo} numberOfLines={2}>{title}</Text>
              </View>
              <Text style={styles.cardTexto}>{info}</Text>
              <Pressable
                onPress={() => setVerInfo(false)}
                style={({ pressed }) => [styles.boton, pressed && styles.pressed]}
              >
                <Text style={styles.botonTexto}>Entendido</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  side: {
    width: 44,
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
    paddingRight: spacing.xs,
  },
  titles: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md + 4,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  cardIcono: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  cardTexto: { fontSize: 14, color: colors.text, lineHeight: 21 },
  boton: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 4,
    paddingVertical: spacing.sm + 2,
  },
  botonTexto: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
