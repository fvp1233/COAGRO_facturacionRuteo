import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import { colors, radius, spacing } from '../../theme';

const ACCENT = '#15803D';
const MONEDAS = ['Local', 'Dólar'];
const TIPOS_PAGO = ['Recibo', 'Monto total', 'Selección de facturas'];

// Inicio de un cobro: se elige moneda y tipo de pago antes de pasar a la siguiente pantalla.
// onContinuar({ moneda, tipoPago }) recibe la selección (la siguiente pantalla se conecta en el contenedor).
export default function CobrosView({ cliente, ruta, onBack, onContinuar }) {
  const insets = useSafeAreaInsets();
  const [moneda, setMoneda] = useState(MONEDAS[0]);
  const [tipoPago, setTipoPago] = useState(TIPOS_PAGO[0]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Cobros" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.clientCard}>
          <View style={styles.clientIcon}>
            <MaterialCommunityIcons name="cash" size={22} color={ACCENT} />
          </View>
          <View style={styles.clientTexts}>
            <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
            <Text style={styles.clientMeta} numberOfLines={1}>
              {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <SelectField label="Moneda" value={moneda} options={MONEDAS} onChange={setMoneda} />
          <SelectField label="Tipo de pago" value={tipoPago} options={TIPOS_PAGO} onChange={setTipoPago} />
        </View>
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          onPress={() => onContinuar?.({ moneda, tipoPago })}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Feather name="check" size={22} color="#FFFFFF" />
          <Text style={styles.actionText}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5FA' },
  content: { padding: spacing.md, gap: spacing.md },
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
  clientName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  clientMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  bar: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  action: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  pressed: { opacity: 0.8 },
});
