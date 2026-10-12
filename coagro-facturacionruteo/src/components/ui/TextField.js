import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

export default function TextField({ label, icon, secure = false, error, style, ...inputProps }) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secure);

  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, focused && styles.fieldFocused, error && styles.fieldError]}>
        {icon ? (
          <MaterialCommunityIcons name={icon} size={22} color={colors.inputIcon} style={styles.icon} />
        ) : null}
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={hidden}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {secure ? (
          <Pressable onPress={() => setHidden((v) => !v)} hitSlop={10}>
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textLabel,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBg,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    borderRadius: radius.md,
  },
  fieldFocused: {
    borderColor: colors.inputBorderFocus,
    backgroundColor: colors.background,
  },
  fieldError: {
    borderColor: '#DC2626',
  },
  error: {
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
    fontSize: 12,
    color: '#DC2626',
  },
  icon: {
    marginRight: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: colors.textPrimary,
  },
});
