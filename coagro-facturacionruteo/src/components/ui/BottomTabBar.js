import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

const ICON_FAMILIES = { Feather, MaterialCommunityIcons };
const ACTIVE = '#15803D';
const INACTIVE = '#334155';

// items: [{ key, label, icon: { family, name }, activeIcon? }]
// Si el item define activeIcon, su estado activo es el círculo verde relleno;
// si no, se marca con la barra superior y el punto indicador.
export default function BottomTabBar({ items, activeKey, onChange }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const filled = active && item.activeIcon;
        const icon = filled ? item.activeIcon : item.icon;
        const Icon = ICON_FAMILIES[icon.family];

        return (
          <Pressable key={item.key} style={styles.tab} onPress={() => onChange?.(item.key)}>
            {active && !filled ? <View style={styles.indicator} /> : null}
            <View style={[styles.iconWrap, filled && styles.iconWrapFilled]}>
              <Icon
                name={icon.name}
                size={filled ? 18 : 22}
                color={filled ? '#FFFFFF' : active ? ACTIVE : INACTIVE}
              />
              {active && !filled ? <View style={styles.dot} /> : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  indicator: {
    position: 'absolute',
    top: -spacing.sm,
    left: spacing.md,
    right: spacing.md,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: ACTIVE,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFilled: {
    backgroundColor: ACTIVE,
    shadowColor: ACTIVE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 3,
    borderColor: '#BBF7D0',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: ACTIVE,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: INACTIVE,
  },
  labelActive: {
    color: ACTIVE,
    fontWeight: '700',
  },
});
