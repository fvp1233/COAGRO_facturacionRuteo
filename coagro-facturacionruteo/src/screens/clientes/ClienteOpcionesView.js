import { Alert, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import OptionTile from '../../components/consulta/OptionTile';
import { OPCIONES_CLIENTE } from '../../constants/opcionesCliente';
import { colors, radius, spacing } from '../../theme';

const COLUMNS = 2;
const ACCENT = '#15803D';

// Página que se abre al validar un cliente: muestra las operaciones disponibles para él.
export default function ClienteOpcionesView({ cliente, ruta, onBack, onOpcion }) {
  const insets = useSafeAreaInsets();

  const rows = [];
  for (let i = 0; i < OPCIONES_CLIENTE.length; i += COLUMNS) {
    const row = OPCIONES_CLIENTE.slice(i, i + COLUMNS);
    rows.push(row);
  }

  const handlePress = (opcion) => {
    if (onOpcion) onOpcion(opcion, cliente);
    else Alert.alert(opcion.title, 'Próximamente.');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Validar cliente" onBack={onBack} />

      <View style={styles.content}>
        <View style={styles.clientCard}>
          <View style={styles.clientIcon}>
            <MaterialCommunityIcons name="account-check" size={22} color={ACCENT} />
          </View>
          <View style={styles.clientTexts}>
            <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
            <Text style={styles.clientMeta} numberOfLines={1}>
              {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          {rows.map((row, index) => (
            <View key={index} style={styles.row}>
              {row.map((opcion) => (
                <OptionTile
                  key={opcion.id}
                  {...opcion}
                  style={styles.cell}
                  onPress={() => handlePress(opcion)}
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
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  clientIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: '#DCF5E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientTexts: { flex: 1 },
  clientName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  clientMeta: {
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
