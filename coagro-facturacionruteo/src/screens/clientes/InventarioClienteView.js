import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Checkbox from '../../components/ui/Checkbox';
import Pagination from '../../components/ui/Pagination';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { ClienteHistorialCard, historialStyles } from '../../components/historial/HistorialComun';
import { calcularConteo, getArticulosInventario, guardarInventario } from '../../repositories/inventarios';
import { getAvisoInventario } from '../../repositories/articulos';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { formatCantidad } from '../../utils/formato';
import { normalizar } from '../../utils/text';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;
const PAGE_SIZE = 10;

function Campo({ label, value, onChange }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoLabel} numberOfLines={1}>{label}</Text>
      <TextInput
        style={styles.campoInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textDisabled}
      />
    </View>
  );
}

// Un artículo de la ruta con los campos para contar (cajas y, si se vende fraccionado, unidades).
function ArticuloCard({ articulo, captura, conteo, onChange }) {
  const cambiar = (campo) => (v) => onChange({ ...captura, [campo]: v });
  return (
    <View style={[styles.card, conteo.contado && styles.cardContada]}>
      <View style={styles.cardTop}>
        <View style={styles.codigo}>
          <Text style={styles.codigoText}>{articulo.codigo}</Text>
        </View>
        {conteo.contado && !conteo.error ? <Feather name="check-circle" size={18} color={colors.success} /> : null}
      </View>
      <Text style={styles.nombre} numberOfLines={2}>{articulo.descripcion}</Text>
      <View style={styles.campos}>
        <Campo label={articulo.empAlm || 'Cajas'} value={captura.cajas ?? ''} onChange={cambiar('cajas')} />
        {articulo.factorVenta > 1 ? (
          <Campo
            label={`${articulo.empDet || 'Unidades'} (${formatCantidad(articulo.factorVenta)})`}
            value={captura.unidades ?? ''}
            onChange={cambiar('unidades')}
          />
        ) : null}
      </View>
      {conteo.error ? <Text style={styles.error}>{conteo.error}</Text> : null}
    </View>
  );
}

// Menú Consultar > Inventario > Nuevo inventario: el vendedor cuenta cuánto tiene el cliente de cada artículo de la ruta.
// Vacío = no contado (no se guarda); 0 = contado y el cliente no lo tiene. Al guardar se numera con
// el consecutivo INVENTARIO de la ruta y queda pendiente para Datos > Enviar datos.
// onGuardado(numero) después de guardar.
export default function InventarioClienteView({ cliente, ruta, onBack, onGuardado }) {
  const insets = useSafeAreaInsets();
  const [inicio] = useState(() => new Date());
  const [articulos, setArticulos] = useState([]);
  const [aviso, setAviso] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [texto, setTexto] = useState('');
  const [soloContados, setSoloContados] = useState(false);
  // { [codigo]: { cajas, unidades } } (textos).
  const [capturas, setCapturas] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const activa = await getRutaActiva();
      const [lista, mensaje] = await Promise.all([getArticulosInventario(activa), getAvisoInventario(activa)]);
      if (cancelado) return;
      setArticulos(lista);
      setAviso(lista.length ? '' : mensaje ?? 'La ruta no tiene artículos en el equipo. Ve a Datos > Cargar datos.');
    })()
      .catch(() => {
        if (!cancelado) setError('No se pudieron leer los artículos de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const conteos = useMemo(
    () => new Map(articulos.map((a) => [a.codigo, calcularConteo(a, capturas[a.codigo])])),
    [articulos, capturas]
  );
  const contados = articulos.filter((a) => conteos.get(a.codigo)?.contado);

  const filtrados = useMemo(() => {
    const q = normalizar(texto.trim());
    return articulos.filter(
      (a) =>
        (!soloContados || conteos.get(a.codigo)?.contado) &&
        (!q || normalizar(a.descripcion).includes(q) || normalizar(a.codigo).includes(q))
    );
  }, [articulos, texto, soloContados, conteos]);
  const pagina = filtrados.slice((page - 1) * pageSize, page * pageSize);

  const guardar = () => {
    if (guardando) return;
    if (!contados.length) {
      Alert.alert('Inventario', 'Cuenta al menos un artículo. Escribe 0 si el cliente no lo tiene.');
      return;
    }
    const conError = contados.find((a) => conteos.get(a.codigo).error);
    if (conError) {
      Alert.alert('Inventario', `${conError.descripcion || conError.codigo}: ${conteos.get(conError.codigo).error}`);
      return;
    }
    Alert.alert(
      'Guardar inventario',
      `${contados.length} ${contados.length === 1 ? 'artículo contado' : 'artículos contados'} de ${cliente.nombre}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar',
          onPress: async () => {
            setGuardando(true);
            try {
              const numero = await guardarInventario({
                ruta,
                cliente,
                articulos,
                capturas,
                inicio,
                fin: new Date(),
              });
              onGuardado?.(numero);
            } catch (e) {
              Alert.alert('No se pudo guardar el inventario', e?.message || 'Error al guardar en la base local.');
            } finally {
              setGuardando(false);
            }
          },
        },
      ]
    );
  };

  // Salir con artículos contados pide confirmación (se pierde lo capturado).
  const salir = () => {
    if (!contados.length) {
      onBack?.();
      return;
    }
    Alert.alert('Salir del inventario', 'Se perderán los artículos contados. ¿Deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: onBack },
    ]);
  };

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader
        title="Inventario del cliente"
        info="Cuenta cuánto tiene el cliente de cada artículo. Deja vacío lo que no contaste y escribe 0 si no lo tiene. Al guardar queda pendiente para Datos > Enviar datos."
        onBack={salir}
      />

      <ScrollView contentContainerStyle={h.content} keyboardShouldPersistTaps="handled">
        <ClienteHistorialCard cliente={cliente} ruta={ruta} />

        {error ? <Text style={h.error}>{error}</Text> : null}
        {aviso ? <Text style={h.aviso}>{aviso}</Text> : null}

        <View style={styles.buscador}>
          <Feather name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.buscadorInput}
            value={texto}
            onChangeText={(t) => {
              setTexto(t);
              setPage(1);
            }}
            placeholder="Buscar por código o descripción..."
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
          />
          {texto ? (
            <Pressable hitSlop={10} onPress={() => setTexto('')}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Checkbox
          label="Ver solo los artículos contados"
          checked={soloContados}
          onChange={(v) => {
            setSoloContados(v);
            setPage(1);
          }}
        />

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={h.loading} />
        ) : filtrados.length ? (
          <View style={h.lista}>
            <Text style={h.contador}>
              {contados.length} de {articulos.length} {articulos.length === 1 ? 'artículo contado' : 'artículos contados'}
            </Text>
            {pagina.map((a) => (
              <ArticuloCard
                key={a.codigo}
                articulo={a}
                captura={capturas[a.codigo] ?? {}}
                conteo={conteos.get(a.codigo)}
                onChange={(c) => setCapturas((prev) => ({ ...prev, [a.codigo]: c }))}
              />
            ))}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtrados.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </View>
        ) : articulos.length ? (
          <View style={h.empty}>
            <Feather name="search" size={28} color={colors.textDisabled} />
            <Text style={h.emptyText}>
              {soloContados ? 'Todavía no has contado ningún artículo.' : 'No hay artículos que coincidan con la búsqueda.'}
            </Text>
          </View>
        ) : null}

        <PrimaryButton title="Guardar inventario" icon="save-outline" loading={guardando} onPress={guardar} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 6,
  },
  cardContada: { borderColor: colors.success },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codigo: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  codigoText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  nombre: { fontSize: 14, fontWeight: '700', color: colors.text },
  campos: { flexDirection: 'row', gap: spacing.sm },
  campo: { flex: 1 },
  campoLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  campoInput: {
    height: 40,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  error: { fontSize: 12, color: colors.error },
});
