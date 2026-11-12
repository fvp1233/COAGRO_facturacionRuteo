import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

// Texto corto de una cuenta: "BANCO · Nombre de la cuenta".
const titulo = (c) => [c.banco, c.nombre].filter(Boolean).join(' · ');

// Selector de cuenta bancaria de la empresa (alCXC_CTA_BCO). Al tocarlo abre la lista.
// cuentas: [{ clave, compania, banco, cuenta, nombre, moneda }] (repositories/cuentasBanco).
// value: clave de la cuenta elegida (o null). onChange(cuenta).
export default function CuentaBancoSelect({ label = 'Cuenta de banco', cuentas, value, onChange }) {
  const [open, setOpen] = useState(false);
  const elegida = cuentas.find((c) => c.clave === value) ?? null;
  const vacia = cuentas.length === 0;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => !vacia && setOpen(true)}
        style={({ pressed }) => [styles.field, vacia && styles.fieldVacio, pressed && styles.pressed]}
      >
        <Feather name="credit-card" size={16} color={colors.textMuted} />
        <View style={styles.fieldTextos}>
          {elegida ? (
            <>
              <Text style={styles.valor} numberOfLines={1}>{titulo(elegida)}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                Cta. {elegida.cuenta}{elegida.moneda ? ` · ${elegida.moneda}` : ''}
              </Text>
            </>
          ) : (
            <Text style={styles.placeholder} numberOfLines={2}>
              {vacia ? 'No hay cuentas: usa Datos > Cargar datos' : 'Selecciona la cuenta'}
            </Text>
          )}
        </View>
        <Feather name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={cuentas}
              keyExtractor={(c) => c.clave}
              renderItem={({ item }) => {
                const selected = item.clave === value;
                return (
                  <Pressable
                    onPress={() => {
                      setOpen(false);
                      onChange?.(item);
                    }}
                    style={({ pressed }) => [styles.option, selected && styles.optionSel, pressed && styles.pressed]}
                  >
                    <View style={styles.fieldTextos}>
                      <Text style={[styles.valor, selected && styles.valorSel]}>{titulo(item)}</Text>
                      <Text style={styles.sub}>
                        Cta. {item.cuenta}
                        {item.moneda ? ` · ${item.moneda}` : ''}
                        {item.compania ? ` · Cía. ${item.compania}` : ''}
                      </Text>
                    </View>
                    {selected ? <Feather name="check" size={18} color={colors.primary} /> : null}
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
  label: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  fieldVacio: { borderStyle: 'dashed' },
  fieldTextos: { flex: 1 },
  valor: { fontSize: 14, fontWeight: '600', color: colors.text },
  valorSel: { color: colors.primary },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  placeholder: { fontSize: 14, color: colors.textDisabled },
  pressed: { opacity: 0.7 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  optionSel: { backgroundColor: colors.primarySoft },
});
