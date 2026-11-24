import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// singleLine: la etiqueta nunca baja a otra línea; si no cabe, reduce un poco la letra.
export default function Checkbox({ label, checked, onChange, singleLine = false, style }) {
  return (
    <Pressable style={[styles.row, singleLine && styles.rowShrink, style]} onPress={() => onChange?.(!checked)} hitSlop={8}>
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
      </View>
      {label ? (
        <Text
          style={[styles.label, singleLine && styles.labelShrink]}
          numberOfLines={singleLine ? 1 : undefined}
          adjustsFontSizeToFit={singleLine}
          minimumFontScale={0.75}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowShrink: { flexShrink: 1 },
  labelShrink: { flexShrink: 1 },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm - 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  label: {
    marginLeft: spacing.sm,
    fontSize: 13,
    color: colors.textMuted,
  },
});
