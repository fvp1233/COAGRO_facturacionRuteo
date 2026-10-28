import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

export default function CenteredHeader({ title, subtitle = 'COAGRO FACTURACIÓN', onBack, onInfo }) {
  return (
    <View style={styles.container}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.side}>
        <Feather name="chevron-left" size={28} color={colors.text} />
      </Pressable>

      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.subtitleRow}>
          <View style={styles.dot} />
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      <Pressable onPress={onInfo} hitSlop={10} style={[styles.side, styles.sideRight]}>
        <Feather name="info" size={22} color={colors.text} />
      </Pressable>
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
});
