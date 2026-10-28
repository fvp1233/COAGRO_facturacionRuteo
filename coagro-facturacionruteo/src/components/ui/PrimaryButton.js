import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

export default function PrimaryButton({ title, icon, onPress, loading = false, style }) {
  return (
    <Pressable
      onPress={loading ? undefined : onPress}
      disabled={loading}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, loading && styles.disabled, style]}
    >
      <Text style={styles.text}>{title}</Text>
      {loading ? <ActivityIndicator color={colors.onPrimary} style={styles.icon} /> : null}
      {!loading && icon ? <Ionicons name={icon} size={22} color={colors.onPrimary} style={styles.icon} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    backgroundColor: colors.textDisabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  text: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  icon: {
    marginLeft: spacing.sm,
  },
});
