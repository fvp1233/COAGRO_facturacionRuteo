import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ORO } from './MetasGraficos';
import { formatCantidad, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const CONFETI = 28;
const COLORES_CONFETI = [ORO, colors.primary, colors.success, colors.warning, '#4C7BD9', '#9B59B6'];

// Una pieza de confeti: cae desde arriba girando y moviéndose de lado.
function Confeti({ indice, alto }) {
  const caida = useRef(new Animated.Value(0)).current;
  const datos = useMemo(
    () => ({
      x: Math.random() * Dimensions.get('window').width,
      deriva: (Math.random() - 0.5) * 120,
      giro: 360 + Math.random() * 720,
      retraso: Math.random() * 600,
      duracion: 1800 + Math.random() * 1400,
      ancho: 6 + Math.random() * 6,
      color: COLORES_CONFETI[indice % COLORES_CONFETI.length],
    }),
    [indice]
  );

  useEffect(() => {
    Animated.loop(
      Animated.timing(caida, {
        toValue: 1,
        duration: datos.duracion,
        delay: datos.retraso,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    return () => caida.stopAnimation();
  }, [caida, datos]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -20,
        left: datos.x,
        width: datos.ancho,
        height: datos.ancho * 1.6,
        borderRadius: 2,
        backgroundColor: datos.color,
        transform: [
          { translateY: caida.interpolate({ inputRange: [0, 1], outputRange: [0, alto + 40] }) },
          { translateX: caida.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, datos.deriva, 0] }) },
          { rotate: caida.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${datos.giro}deg`] }) },
        ],
      }}
    />
  );
}

// Animación de recompensa al cumplir metas: trofeo que entra con rebote, rayos girando detrás,
// confeti y la lista de lo cumplido. global = se cumplió la meta total del mes (trofeo mayor).
//   metas: las metas recién cumplidas ({ codigo, descripcion, meta, vendido, incentivoEstimado }).
export default function TrofeoModal({ visible, metas = [], global = false, periodoTexto, onClose }) {
  const alto = Dimensions.get('window').height;
  const entrada = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current;
  const pulso = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    entrada.setValue(0);
    giro.setValue(0);
    pulso.setValue(0);
    Animated.spring(entrada, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }).start();
    const rayos = Animated.loop(
      Animated.timing(giro, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
    );
    const latido = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    rayos.start();
    latido.start();
    return () => {
      rayos.stop();
      latido.stop();
    };
  }, [visible, entrada, giro, pulso]);

  const incentivo = metas.reduce((s, m) => s + (m.incentivoEstimado ?? 0), 0);
  const titulo = global
    ? '¡Cumpliste tu meta del mes!'
    : metas.length === 1
      ? '¡Meta cumplida!'
      : `¡Cumpliste ${metas.length} metas!`;

  const escala = entrada.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const latido = pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const rotacion = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const brinco = entrada.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.fondo}>
        {visible ? Array.from({ length: CONFETI }, (_, i) => <Confeti key={i} indice={i} alto={alto} />) : null}

        <Animated.View style={[styles.caja, { opacity: entrada, transform: [{ scale: escala }] }]}>
          <View style={styles.trofeoZona}>
            <Animated.View style={[styles.rayos, { transform: [{ rotate: rotacion }] }]}>
              <MaterialCommunityIcons name="star-four-points" size={170} color="#FFE7A3" />
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: brinco }, { scale: latido }] }}>
              <MaterialCommunityIcons name={global ? 'trophy-award' : 'trophy'} size={global ? 110 : 96} color={ORO} />
            </Animated.View>
          </View>

          <Text style={styles.titulo}>{titulo}</Text>
          {periodoTexto ? <Text style={styles.periodo}>{periodoTexto}</Text> : null}

          {metas.length ? (
            <ScrollView style={styles.lista} contentContainerStyle={styles.listaContenido}>
              {metas.map((m) => (
                <View key={m.codigo} style={styles.fila}>
                  <MaterialCommunityIcons name="trophy" size={16} color={ORO} />
                  <View style={styles.filaTexts}>
                    <Text style={styles.filaNombre} numberOfLines={1}>{m.descripcion || m.codigo}</Text>
                    <Text style={styles.filaDetalle}>
                      {formatCantidad(m.vendido)} de {formatCantidad(m.meta)} unidades
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {incentivo > 0 ? (
            <View style={styles.incentivo}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={colors.success} />
              <Text style={styles.incentivoText}>
                Incentivo de estas metas: <Text style={styles.incentivoValor}>{formatMonto(incentivo)}</Text>
              </Text>
            </View>
          ) : null}

          <Pressable onPress={onClose} style={({ pressed }) => [styles.boton, pressed && styles.pressed]}>
            <Text style={styles.botonText}>¡Genial!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    overflow: 'hidden',
  },
  caja: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  trofeoZona: { width: 180, height: 150, alignItems: 'center', justifyContent: 'center' },
  rayos: { position: 'absolute' },
  titulo: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  periodo: { fontSize: 13, color: colors.textMuted },
  lista: { alignSelf: 'stretch', maxHeight: 200 },
  listaContenido: { gap: spacing.sm, paddingVertical: spacing.xs },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFF8E6',
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  filaTexts: { flex: 1 },
  filaNombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  filaDetalle: { fontSize: 12, color: colors.textMuted },
  incentivo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  incentivoText: { fontSize: 13, color: colors.textMuted },
  incentivoValor: { fontWeight: '800', color: colors.success },
  boton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    marginTop: spacing.sm,
  },
  botonText: { fontSize: 16, fontWeight: '800', color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
