import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

const ICON_FAMILIES = { Feather, MaterialCommunityIcons };

export default function ModuleCard({ title, subtitle, icon, palette, onPress, style }) {
  const Icon = ICON_FAMILIES[icon.family];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed, style]}
    >
      <LinearGradient
        colors={[palette.tint, colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { borderColor: palette.border }]}
      >
        <View style={styles.topRow}>
          <Feather name="arrow-right" size={16} color={palette.accent} />
        </View>

        <View style={styles.center}>
          <LinearGradient
            colors={palette.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.iconTile, { shadowColor: palette.gradient[1] }]}
          >
            <Icon name={icon.name} size={30} color={colors.onPrimary} />
          </LinearGradient>
        </View>

        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.lg,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  // El ícono y los textos van centrados en la card; la flecha flota en la esquina sin empujarlos.
  card: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  topRow: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 4,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  texts: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
