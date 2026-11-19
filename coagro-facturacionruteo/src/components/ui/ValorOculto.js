import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { colors } from '../../theme';

// Valor discreto que no se muestra de entrada: "👁 Ver descuento" en letra chica; al tocarlo muestra el
// valor y al tocarlo otra vez lo vuelve a ocultar. Para los topes de descuento (estrategia de venta: el
// vendedor puede consultarlos, pero no quedan en primer plano).
//   valor: texto a mostrar. etiqueta: texto del enlace (por defecto "Ver descuento").
export default function ValorOculto({ valor, etiqueta = 'Ver descuento', style }) {
  const [visible, setVisible] = useState(false);
  return (
    <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} style={[styles.root, style]}>
      <Feather name={visible ? 'eye-off' : 'eye'} size={12} color={colors.textMuted} />
      <Text style={styles.texto}>{visible ? valor : etiqueta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  texto: { fontSize: 11, color: colors.textMuted },
});
