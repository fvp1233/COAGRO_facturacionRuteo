import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// Lista para elegir la ruta activa. obligatorio: no se puede cerrar sin elegir (hay varias rutas
// y ninguna elegida). Cada ruta muestra su grupo de artículos y su bodega del ERP.
export default function RutaActivaPicker({ visible, rutas = [], actual, obligatorio = false, onSelect, onClose }) {
  const cerrar = () => {
    if (!obligatorio) onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cerrar}>
      <Pressable style={styles.backdrop} onPress={cerrar}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>¿Con qué ruta vas a trabajar?</Text>
          {obligatorio ? (
            <Text style={styles.subtitle}>Este equipo tiene varias rutas asignadas. Elige una para continuar.</Text>
          ) : null}
          <FlatList
            data={rutas}
            keyExtractor={(item) => item.codigo}
            renderItem={({ item }) => {
              const selected = item.codigo === actual?.codigo;
              return (
                <Pressable
                  onPress={() => onSelect?.(item)}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                >
                  <View style={styles.texts}>
                    <Text style={[styles.optionText, selected && styles.optionSelected]}>{item.label}</Text>
                    <Text style={[styles.detail, !item.bodegaErp && styles.detailWarning]}>
                      Grupo {item.grupoArticulo ?? '—'} · {item.bodegaErp ? `Bodega ${item.bodegaErp}` : 'Sin bodega configurada'}
                    </Text>
                  </View>
                  {selected ? <Ionicons name="checkmark" size={18} color="#15803D" /> : null}
                </Pressable>
              );
            }}
          />
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
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    maxHeight: '70%',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flexShrink: 1,
  },
  optionText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  optionSelected: {
    fontWeight: '700',
    color: '#15803D',
  },
  detail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  detailWarning: {
    color: '#B45309',
  },
});
