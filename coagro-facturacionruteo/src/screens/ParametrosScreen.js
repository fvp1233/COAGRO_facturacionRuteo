import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../components/ui/CenteredHeader';
import OptionTile from '../components/consulta/OptionTile';
import ParametrosSistemaView from './parametros/ParametrosSistemaView';
import { PARAMETROS } from '../constants/parametros';
import { colors, radius, spacing } from '../theme';

const COLUMNS = 2;
const ACCENT = '#4F46E5';

// Parámetros que ya tienen pantalla propia.
const VISTAS = {
  sistema: ParametrosSistemaView,
};

// Módulo Parámetros: menú con las opciones de configuración del sistema y del dispositivo.
export default function ParametrosScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  // Opción abierta (id de PARAMETROS) o null para mostrar el menú.
  const [activo, setActivo] = useState(null);

  const rows = [];
  for (let i = 0; i < PARAMETROS.length; i += COLUMNS) {
    rows.push(PARAMETROS.slice(i, i + COLUMNS));
  }

  const handlePress = (parametro) => {
    if (VISTAS[parametro.id]) setActivo(parametro.id);
    else Alert.alert(parametro.title, 'Próximamente.');
  };

  const Vista = activo ? VISTAS[activo] : null;
  if (Vista) {
    return <Vista onBack={() => setActivo(null)} />;
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Parámetros" onBack={onBack} />

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <MaterialCommunityIcons name="tune-variant" size={22} color={ACCENT} />
          </View>
          <View style={styles.infoTexts}>
            <Text style={styles.infoTitle}>Configuración</Text>
            <Text style={styles.infoMeta} numberOfLines={1}>Sistema, comprobantes, dispositivo e impresión</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {rows.map((row, index) => (
            <View key={index} style={styles.row}>
              {row.map((parametro) => (
                <OptionTile
                  key={parametro.id}
                  {...parametro}
                  style={styles.cell}
                  onPress={() => handlePress(parametro)}
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
    backgroundColor: '#F4F5FA',
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTexts: { flex: 1 },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  infoMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
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
