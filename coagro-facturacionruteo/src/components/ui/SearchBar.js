import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../../theme';

const ACCENT = '#15803D';

// Barra de búsqueda con selector desplegable del campo por el que se busca.
// modes: [{ key, label, icon (Feather) }]. mode = key activa.
// onSubmit(query): si se pasa, la búsqueda se aplica solo con Enter o con el botón de buscar
// (y al limpiar con la X); si no, el contenedor filtra con cada cambio de onQueryChange.
export default function SearchBar({ modes, mode, onModeChange, query, onQueryChange, onSubmit, style }) {
  const [open, setOpen] = useState(false);
  const actual = modes.find((m) => m.key === mode) ?? modes[0];

  const elegir = (key) => {
    setOpen(false);
    onModeChange?.(key);
  };

  return (
    <View style={[styles.search, style]}>
      <Pressable
        style={({ pressed }) => [styles.mode, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
      >
        <Feather name={actual.icon} size={16} color={ACCENT} />
        <Text style={styles.modeText} numberOfLines={1}>{actual.label}</Text>
        <Feather name="chevron-down" size={14} color={colors.textPrimary} />
      </Pressable>
      <TextInput
        style={styles.input}
        placeholder={`Buscar por ${actual.label.toLowerCase()}...`}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={onQueryChange}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit ? () => onSubmit(query) : undefined}
      />
      {query ? (
        <Pressable
          style={styles.clear}
          onPress={() => {
            onQueryChange?.('');
            onSubmit?.('');
          }}
          hitSlop={8}
        >
          <Feather name="x" size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
      {onSubmit ? (
        <Pressable
          style={({ pressed }) => [styles.submit, pressed && styles.pressed]}
          onPress={() => onSubmit(query)}
        >
          <Feather name="search" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Buscar por</Text>
            {modes.map((m) => {
              const selected = m.key === actual.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => elegir(m.key)}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <Feather name={m.icon} size={16} color={selected ? ACCENT : colors.textSecondary} />
                  <Text style={[styles.optionText, selected && styles.optionSelected]}>{m.label}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={ACCENT} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    backgroundColor: '#EEF1FA',
    maxWidth: 150,
  },
  modeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
    fontSize: 15,
    color: colors.textPrimary,
  },
  clear: {
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
  },
  submit: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  pressed: {
    opacity: 0.7,
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
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  optionSelected: {
    fontWeight: '700',
    color: ACCENT,
  },
});
