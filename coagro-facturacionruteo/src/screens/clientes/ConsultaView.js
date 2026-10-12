import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import CenteredHeader from '../../components/ui/CenteredHeader';
import OptionTile from '../../components/consulta/OptionTile';
import { CONSULTAS } from '../../constants/consultas';
import { colors, radius, spacing } from '../../theme';

const COLUMNS = 3;
const ACCENT = '#15803D';

export default function ConsultaView({ onBack, onOpenConsulta }) {
  const rows = [];
  for (let i = 0; i < CONSULTAS.length; i += COLUMNS) {
    rows.push(CONSULTAS.slice(i, i + COLUMNS));
  }

  return (
    <View style={styles.root}>
      <CenteredHeader title="Opciones de Consulta" onBack={onBack} />

      <View style={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <MaterialCommunityIcons name="shield-check" size={18} color={ACCENT} />
            <Text style={styles.metaTitle}>Módulos de Campo</Text>
          </View>
          <View style={styles.routeChip}>
            <View style={styles.routeDot} />
            <Text style={styles.routeText}>Ruta #04 Activa</Text>
          </View>
        </View>

        <View style={styles.grid}>
          {rows.map((row, index) => (
            <View key={index} style={styles.row}>
              {row.map((option) => (
                <OptionTile
                  key={option.id}
                  {...option}
                  style={styles.cell}
                  onPress={() => onOpenConsulta?.(option)}
                />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.status}>
          <View style={styles.statusIcon}>
            <MaterialCommunityIcons name="cloud-check" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.statusTexts}>
            <Text style={styles.statusTitle}>Base Local Actualizada</Text>
            <Text style={styles.statusSubtitle}>Sincronizado hoy 07:15 AM · Modo offline</Text>
          </View>
          <View style={styles.version}>
            <Text style={styles.versionText}>v2.4</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm + 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textLabel,
  },
  routeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: ACCENT,
  },
  routeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
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
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm + 4,
  },
  statusIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm + 2,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTexts: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  version: {
    backgroundColor: '#F1F5F9',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
});
