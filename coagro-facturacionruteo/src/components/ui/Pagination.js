import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import SelectField from './SelectField';
import { colors, radius, spacing } from '../../theme';

const ACCENT = '#15803D';

// Barra de paginación: selector de registros por página, rango mostrado y botones de navegación.
// page empieza en 1. onPageSizeChange recibe un número.
export default function Pagination({ page, pageSize, total, pageSizes = [10, 25, 50, 100], onPageChange, onPageSizeChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  const primera = page <= 1;
  const ultima = page >= totalPages;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.sizeGroup}>
          <Text style={styles.label}>Mostrar</Text>
          <SelectField
            label=""
            value={String(pageSize)}
            options={pageSizes.map(String)}
            onChange={(v) => onPageSizeChange?.(Number(v))}
            style={styles.select}
          />
          <Text style={styles.label}>registros</Text>
        </View>
        <Text style={styles.range}>
          {desde}–{hasta} de {total}
        </Text>
      </View>

      <View style={styles.row}>
        <NavButton icon="chevrons-left" disabled={primera} onPress={() => onPageChange?.(1)} />
        <NavButton icon="chevron-left" disabled={primera} onPress={() => onPageChange?.(page - 1)} />
        <Text style={styles.pageText}>
          Página <Text style={styles.pageBold}>{page}</Text> de {totalPages}
        </Text>
        <NavButton icon="chevron-right" disabled={ultima} onPress={() => onPageChange?.(page + 1)} />
        <NavButton icon="chevrons-right" disabled={ultima} onPress={() => onPageChange?.(totalPages)} />
      </View>
    </View>
  );
}

function NavButton({ icon, disabled, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.nav, disabled && styles.navDisabled, pressed && styles.navPressed]}
    >
      <Feather name={icon} size={18} color={disabled ? colors.placeholder : ACCENT} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sizeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  select: {
    width: 72,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.sm + 2,
    overflow: 'hidden',
  },
  range: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  nav: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: colors.divider,
  },
  navPressed: {
    opacity: 0.7,
  },
  pageText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    color: colors.textSecondary,
  },
  pageBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
