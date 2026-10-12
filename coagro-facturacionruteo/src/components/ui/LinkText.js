import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme';

export default function LinkText({ title, onPress, chevron = false, style }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.row, style]}>
      {({ pressed }) => (
        <>
          <Text style={[styles.text, pressed && styles.pressed]}>{title}</Text>
          {chevron ? (
            <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} style={styles.icon} />
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  pressed: {
    opacity: 0.6,
  },
  icon: {
    marginLeft: spacing.xs,
  },
});
