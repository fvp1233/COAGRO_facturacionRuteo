import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// Selector: al tocarlo abre una lista con todas las opciones para elegir una.
export default function SelectField({ label, value, options = [], onChange, style }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (option) => {
    setOpen(false);
    onChange?.(option);
  };

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => options.length && setOpen(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Text style={styles.value} numberOfLines={1}>{value}</Text>
        <Ionicons name="caret-down" size={10} color={colors.textSecondary} style={styles.caret} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label || 'Seleccionar'}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item)}
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <Pressable
                    onPress={() => handleSelect(item)}
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionSelected]}>{item}</Text>
                    {selected ? <Ionicons name="checkmark" size={18} color="#15803D" /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  field: {
    height: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.background,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.lg,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  value: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  caret: {
    position: 'absolute',
    right: spacing.sm,
    top: 10,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  optionText: {
    fontSize: 15,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  optionSelected: {
    fontWeight: '700',
    color: '#15803D',
  },
});
