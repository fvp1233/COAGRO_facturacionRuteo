import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../components/ui/CenteredHeader';
import OptionTile from '../components/consulta/OptionTile';
import InventarioReporteView from './reportes/InventarioReporteView';
import { REPORTES } from '../constants/reportes';
import { colors, radius, spacing } from '../theme';

const COLUMNS = 2;
const ACCENT = colors.primary;

function formatHoy() {
  return new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Reportes que ya tienen pantalla propia.
const VISTAS = {
  inventario: InventarioReporteView,
};

// Módulo Reportes: menú con los reportes disponibles de la jornada.
export default function ReportesScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  // Reporte abierto (id de REPORTES) o null para mostrar el menú.
  const [activo, setActivo] = useState(null);

  const rows = [];
  for (let i = 0; i < REPORTES.length; i += COLUMNS) {
    rows.push(REPORTES.slice(i, i + COLUMNS));
  }

  const handlePress = (reporte) => {
    if (VISTAS[reporte.id]) setActivo(reporte.id);
    else Alert.alert(reporte.title, 'Próximamente.');
  };

  const Vista = activo ? VISTAS[activo] : null;
  if (Vista) {
    return <Vista onBack={() => setActivo(null)} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Reportes" onBack={onBack} />

      <View style={styles.content}>
        <View style={styles.dayCard}>
          <View style={styles.dayIcon}>
            <MaterialCommunityIcons name="chart-box" size={22} color={ACCENT} />
          </View>
          <View style={styles.dayTexts}>
            <Text style={styles.dayTitle}>Reportes de la jornada</Text>
            <Text style={styles.dayMeta} numberOfLines={1}>{formatHoy()}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {rows.map((row, index) => (
            <View key={index} style={styles.row}>
              {row.map((reporte) => (
                <OptionTile
                  key={reporte.id}
                  {...reporte}
                  style={styles.cell}
                  onPress={() => handlePress(reporte)}
                />
              ))}
              {row.length < COLUMNS ? <View style={styles.cell} /> : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  dayIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTexts: { flex: 1 },
  dayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  dayMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  grid: {
    flex: 1,
    gap: spacing.sm + 2,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  cell: {
    flex: 1,
  },
});
