import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { PREGUNTAS } from '../../constants/preguntas';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

const parrafos = (respuesta) => (Array.isArray(respuesta) ? respuesta : [respuesta]);
const clave = (grupo, i) => `${grupo.id}|${i}`;

function Pregunta({ item, abierta, onToggle }) {
  return (
    <View style={[styles.pregunta, abierta && styles.preguntaAbierta]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.preguntaHeader, pressed && styles.pressed]}>
        <Text style={styles.preguntaText}>{item.pregunta}</Text>
        <Feather name={abierta ? 'minus' : 'plus'} size={18} color={colors.primary} />
      </Pressable>
      {abierta ? (
        <View style={styles.respuesta}>
          {parrafos(item.respuesta).map((p, i) => (
            <Text key={i} style={styles.respuestaText}>{p}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Parámetros > Consultas: preguntas frecuentes (constants/preguntas.js) agrupadas por tema. Cada
// pregunta se abre y se cierra; el buscador filtra por la pregunta o la respuesta (sin importar
// acentos ni mayúsculas) y muestra abiertas las que coinciden.
export default function ParametrosConsultasView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [busqueda, setBusqueda] = useState('');
  // Sin búsqueda: claves de las preguntas abiertas. Con búsqueda (todas abiertas): las que se cerraron.
  const [marcadas, setMarcadas] = useState(() => new Set());

  const termino = normalizar(busqueda.trim());
  const grupos = useMemo(() => {
    if (!termino) return PREGUNTAS.map((g) => ({ grupo: g, items: g.preguntas.map((p, i) => ({ p, i })) }));
    const palabras = termino.split(/\s+/);
    return PREGUNTAS.map((g) => ({
      grupo: g,
      items: g.preguntas
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => {
          const texto = normalizar([p.pregunta, ...parrafos(p.respuesta)].join(' '));
          return palabras.every((w) => texto.includes(w));
        }),
    })).filter((x) => x.items.length);
  }, [termino]);

  const buscar = (texto) => {
    setBusqueda(texto);
    setMarcadas(new Set());
  };
  const toggle = (k) =>
    setMarcadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(k)) nuevo.delete(k);
      else nuevo.add(k);
      return nuevo;
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Respuestas a las dudas más comunes. Busca una palabra o toca una pregunta para ver la respuesta.'} title="Preguntas frecuentes" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Feather name="help-circle" size={22} color={colors.primary} />
          <Text style={styles.introText}>
            Respuestas a las dudas más comunes. Toca una pregunta para ver la respuesta o busca una palabra.
          </Text>
        </View>

        <View style={styles.buscador}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.buscadorInput}
            value={busqueda}
            onChangeText={buscar}
            placeholder="Buscar una pregunta..."
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
          />
          {busqueda ? (
            <Pressable hitSlop={10} onPress={() => buscar('')}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {grupos.length ? (
          grupos.map(({ grupo, items }) => (
            <View key={grupo.id} style={styles.grupo}>
              <View style={styles.grupoHeader}>
                <Feather name={grupo.icono} size={16} color={colors.primary} />
                <Text style={styles.grupoTitulo}>{grupo.titulo.toUpperCase()}</Text>
              </View>
              {items.map(({ p, i }) => {
                const k = clave(grupo, i);
                return (
                  <Pregunta
                    key={k}
                    item={p}
                    abierta={termino ? !marcadas.has(k) : marcadas.has(k)}
                    onToggle={() => toggle(k)}
                  />
                );
              })}
            </View>
          ))
        ) : (
          <View style={styles.vacio}>
            <Feather name="search" size={28} color={colors.textDisabled} />
            <Text style={styles.vacioText}>
              No hay preguntas que coincidan con "{busqueda.trim()}". Revisa también Parámetros &gt; Manual de usuario.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  intro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  introText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 4,
  },
  buscadorInput: { flex: 1, fontSize: 14, color: colors.text },
  grupo: { gap: spacing.sm },
  grupoHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  grupoTitulo: { fontSize: 12, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  pregunta: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  preguntaAbierta: { borderColor: colors.primary },
  preguntaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  preguntaText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  respuesta: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  respuestaText: { fontSize: 13, color: colors.text, lineHeight: 19 },
  vacio: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  vacioText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
