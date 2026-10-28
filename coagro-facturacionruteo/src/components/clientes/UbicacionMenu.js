import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

const OPCIONES = [
  { id: 'ir', label: 'Ir al destino', icon: 'navigation' },
  { id: 'asignar', label: 'Asignar coordenadas', icon: 'crosshair' },
];

// Menú de ubicación del cliente seleccionado: ir al destino o asignar coordenadas.
export default function UbicacionMenu({ visible, onClose, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Ubicación</Text>
          {OPCIONES.map((op) => (
            <Pressable
              key={op.id}
              onPress={() => onSelect?.(op.id)}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
            >
              <View style={styles.iconWrap}>
                <Feather name={op.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.optionText}>{op.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
});
