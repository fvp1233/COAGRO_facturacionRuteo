import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { getDeviceFirma } from '../../services/deviceFirma';
import { colors, radius, spacing } from '../../theme';

// Firma del equipo (solo lectura) con botón para copiarla. Soporte la usa para identificar el
// equipo cuando hay que liberar o ligar la handheld.
export default function FirmaEquipo({ label = 'Firma del equipo', style }) {
  const [firma, setFirma] = useState(null);
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getDeviceFirma()
      .then((valor) => {
        if (!cancelado) setFirma(valor);
      })
      .catch(() => {
        if (!cancelado) setFirma('');
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!copiada) return undefined;
    const timer = setTimeout(() => setCopiada(false), 2000);
    return () => clearTimeout(timer);
  }, [copiada]);

  const copiar = async () => {
    if (!firma) return;
    await Clipboard.setStringAsync(firma);
    setCopiada(true);
  };

  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={styles.value} selectable numberOfLines={2}>
          {firma === null ? 'Cargando…' : firma || 'No disponible'}
        </Text>
        <Pressable
          onPress={copiar}
          disabled={!firma}
          hitSlop={8}
          style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
        >
          <Feather name={copiada ? 'check' : 'copy'} size={16} color={copiada ? '#15803D' : colors.textSecondary} />
          <Text style={[styles.copyText, copiada && styles.copiedText]}>{copiada ? 'Copiada' : 'Copiar'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm + 2,
    backgroundColor: '#F3F5F9',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  value: { flex: 1, fontSize: 13, color: colors.textPrimary, fontFamily: 'monospace' },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.6 },
  copyText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  copiedText: { color: '#15803D' },
});
