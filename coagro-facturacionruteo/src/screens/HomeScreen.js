import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import ModuleCard from '../components/home/ModuleCard';
import { MODULES } from '../constants/modules';
import { colors, radius, spacing } from '../theme';

const COLUMNS = 2;

export default function HomeScreen({ onOpenModule, onLogout }) {
  const insets = useSafeAreaInsets();

  const rows = [];
  for (let i = 0; i < MODULES.length; i += COLUMNS) {
    rows.push(MODULES.slice(i, i + COLUMNS));
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <StatusBar style="dark" />

      <View style={styles.topBar}>
        <Pressable
          onPress={onLogout}
          hitSlop={8}
          style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}
        >
          <Feather name="log-out" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            {row.map((module) => (
              <ModuleCard
                key={module.id}
                {...module}
                style={styles.cell}
                onPress={() => onOpenModule?.(module)}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F6F8F6',
    paddingHorizontal: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
  },
  logout: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutPressed: {
    opacity: 0.7,
  },
  grid: {
    flex: 1,
    gap: spacing.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  cell: {
    flex: 1,
  },
});
