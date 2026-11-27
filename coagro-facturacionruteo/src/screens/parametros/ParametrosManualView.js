import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { MANUAL } from '../../constants/manual';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

// Todo el texto de una sección (título, resumen y bloques), normalizado para buscar.
const textoSeccion = (s) =>
  normalizar(
    [s.titulo, s.resumen, ...s.bloques.flatMap((b) => (b.items ? b.items : [b.texto]))].join(' ')
  );
const INDICE = MANUAL.map((s) => ({ seccion: s, texto: textoSeccion(s) }));

function Bloque({ bloque }) {
  switch (bloque.tipo) {
    case 'subtitulo':
      return <Text style={styles.subtitulo}>{bloque.texto}</Text>;
    case 'pasos':
      return (
        <View style={styles.lista}>
          {bloque.items.map((item, i) => (
            <View key={i} style={styles.paso}>
              <View style={styles.pasoNumero}>
                <Text style={styles.pasoNumeroText}>{i + 1}</Text>
              </View>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'lista':
      return (
        <View style={styles.lista}>
          {bloque.items.map((item, i) => (
            <View key={i} style={styles.vineta}>
              <View style={styles.punto} />
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'nota':
      return (
        <View style={styles.nota}>
          <Feather name="info" size={16} color={colors.primary} style={styles.notaIcono} />
          <Text style={styles.notaText}>{bloque.texto}</Text>
        </View>
      );
    default:
      return <Text style={styles.parrafo}>{bloque.texto}</Text>;
  }
}

function Seccion({ seccion, abierta, onToggle }) {
  return (
    <View style={[styles.seccion, abierta && styles.seccionAbierta]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.seccionHeader, pressed && styles.pressed]}>
        <View style={styles.seccionIcono}>
          <Feather name={seccion.icono} size={18} color={colors.primary} />
        </View>
        <View style={styles.seccionTextos}>
          <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
          <Text style={styles.seccionResumen} numberOfLines={abierta ? undefined : 2}>
            {seccion.resumen}
          </Text>
        </View>
        <Feather name={abierta ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
      </Pressable>
      {abierta ? (
        <View style={styles.seccionCuerpo}>
          {seccion.bloques.map((b, i) => (
            <Bloque key={i} bloque={b} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Parámetros > Manual de usuario: guía de toda la app (constants/manual.js) en secciones plegables.
// El buscador filtra por cualquier palabra del contenido (sin importar acentos ni mayúsculas) y abre
// las secciones que coinciden.
export default function ParametrosManualView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [busqueda, setBusqueda] = useState('');
  // Sin búsqueda: ids de las secciones abiertas. Con búsqueda (todas abiertas): ids de las que se cerraron.
  const [abiertas, setAbiertas] = useState(() => new Set());
  const buscar = (texto) => {
    setBusqueda(texto);
    setAbiertas(new Set());
  };

  const termino = normalizar(busqueda.trim());
  const secciones = useMemo(() => {
    if (!termino) return MANUAL;
    const palabras = termino.split(/\s+/);
    return INDICE.filter(({ texto }) => palabras.every((p) => texto.includes(p))).map(({ seccion }) => seccion);
  }, [termino]);

  const toggle = (id) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Guía paso a paso de cada parte de la app. Busca una palabra o toca una sección.'} title="Manual de usuario" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Feather name="book-open" size={22} color={colors.primary} />
          <Text style={styles.introText}>
            Guía de uso de la app. Toca una sección para ver cómo hacer cada cosa, o busca una palabra (por
            ejemplo "pedido", "cheque" o "anular").
          </Text>
        </View>

        <View style={styles.buscador}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.buscadorInput}
            value={busqueda}
            onChangeText={buscar}
            placeholder="Buscar en el manual..."
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
          />
          {busqueda ? (
            <Pressable hitSlop={10} onPress={() => buscar('')}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {secciones.length ? (
          secciones.map((s) => (
            <Seccion
              key={s.id}
              seccion={s}
              // Con búsqueda, las secciones que coinciden se muestran abiertas.
              abierta={termino ? !abiertas.has(s.id) : abiertas.has(s.id)}
              onToggle={() => toggle(s.id)}
            />
          ))
        ) : (
          <View style={styles.vacio}>
            <Feather name="search" size={28} color={colors.textDisabled} />
            <Text style={styles.vacioText}>No hay temas que coincidan con "{busqueda.trim()}".</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.sm + 4 },
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
  seccion: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  seccionAbierta: { borderColor: colors.primary },
  seccionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md },
  seccionIcono: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seccionTextos: { flex: 1 },
  seccionTitulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  seccionResumen: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  seccionCuerpo: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm + 4,
  },
  subtitulo: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  parrafo: { fontSize: 13, color: colors.text, lineHeight: 19 },
  lista: { gap: spacing.sm },
  paso: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
  pasoNumero: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  pasoNumeroText: { fontSize: 12, fontWeight: '700', color: colors.onPrimary },
  vineta: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start', paddingLeft: 4 },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 7 },
  itemText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 19 },
  nota: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm + 2,
    padding: spacing.sm + 4,
  },
  notaIcono: { marginTop: 1 },
  notaText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 18 },
  vacio: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  vacioText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
