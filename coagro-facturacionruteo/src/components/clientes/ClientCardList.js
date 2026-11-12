import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, radius, spacing } from '../../theme';

// Hora (HH:MM) de un INICIO guardado como 'YYYY-MM-DD HH:MM:SS' (hora local).
const horaDe = (inicio) => (inicio ? String(inicio).slice(11, 16) : null);

function ClientCard({ cliente, selected, onPress, onUbicacion }) {
  const hora = horaDe(cliente.visitaHoy);
  const visitado = Boolean(hora);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        // La línea izquierda siempre indica el estado de visita, aunque la card esté seleccionada.
        visitado ? styles.cardVisitado : styles.cardPendiente,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.orden, selected && styles.ordenSelected]}>
          {selected ? (
            <Feather name="check" size={16} color={colors.onPrimary} />
          ) : (
            <Text style={styles.ordenText}>{cliente.orden ?? '–'}</Text>
          )}
        </View>

        <View style={styles.body}>
          <View style={styles.topLine}>
            <View style={[styles.code, selected && styles.codeSelected]}>
              <Text style={[styles.codeText, selected && styles.codeTextSelected]}>{cliente.codigo}</Text>
            </View>
            {visitado ? (
              <View style={styles.badgeVisitado}>
                <Feather name="check-circle" size={11} color={colors.success} />
                <Text style={styles.badgeVisitadoText}>VISITADO {hora}</Text>
              </View>
            ) : (
              <View style={styles.badgePendiente}>
                <Text style={styles.badgePendienteText}>PENDIENTE</Text>
              </View>
            )}
          </View>

          <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={2}>
            {cliente.nombre}
          </Text>
        </View>
      </View>

      {selected ? (
        <View style={styles.detail}>
          <View style={styles.detailTexts}>
            <Text style={styles.detailLabel}>DIRECCIÓN</Text>
            <Text style={styles.detailText}>{cliente.direccion || 'Sin dirección registrada'}</Text>
          </View>
          <Pressable
            onPress={onUbicacion}
            hitSlop={8}
            style={({ pressed }) => [styles.mapButton, pressed && styles.cardPressed]}
          >
            <MaterialCommunityIcons name="google-maps" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

// Lista de clientes en cards. La card seleccionada se expande con la dirección y el acceso a mapas.
export default function ClientCardList({ clientes, selectedCodigo, onSelect, onUbicacion }) {
  if (!clientes.length) {
    return (
      <View style={styles.empty}>
        <Feather name="users" size={28} color={colors.textDisabled} />
        <Text style={styles.emptyText}>No se encontraron clientes</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {clientes.map((c) => (
        <ClientCard
          key={c.codigo}
          cliente={c}
          selected={c.codigo === selectedCodigo}
          onPress={() => onSelect?.(c)}
          onUbicacion={onUbicacion}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm + 2,
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    padding: spacing.sm + 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardVisitado: {
    borderLeftColor: colors.success,
  },
  cardPendiente: {
    borderLeftColor: colors.warning,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#FFF7F7',
  },
  cardPressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  orden: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordenSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ordenText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  code: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  codeSelected: {
    backgroundColor: colors.primary,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  codeTextSelected: {
    color: colors.onPrimary,
  },
  badgeVisitado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E3F2F1',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeVisitadoText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  badgePendiente: {
    backgroundColor: '#FEEBD3',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgePendienteText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B85F00',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  nameSelected: {
    color: colors.primaryDark,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm + 4,
    paddingTop: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.primarySoft,
  },
  detailTexts: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
