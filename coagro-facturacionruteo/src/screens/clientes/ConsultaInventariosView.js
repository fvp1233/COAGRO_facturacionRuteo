import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import Pagination from '../../components/ui/Pagination';
import InventarioLineasTable from '../../components/clientes/InventarioLineasTable';
import InventarioClienteView from './InventarioClienteView';
import {
  ClienteHistorialCard,
  Dato,
  DetalleSheet,
  Etiqueta,
  formatFechaHora,
  historialStyles,
} from '../../components/historial/HistorialComun';
import { descartarInventario, getInventariosCliente, getLineasInventario } from '../../repositories/inventarios';
import { formatFechaDoc } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;
const PAGE_SIZE = 10;

// Estado del inventario: texto, tono de la etiqueta y color de la línea izquierda de la card.
const ESTADOS = {
  pendiente: { texto: 'SIN ENVIAR', tono: 'ambar', color: colors.warning },
  error: { texto: 'CON ERROR', tono: 'rojo', color: colors.error },
  enviado: { texto: 'PENDIENTE DE PROCESAR', tono: 'ambar', color: colors.primary },
  procesado: { texto: 'PROCESADO', tono: 'verde', color: colors.success },
};
const clave = (i) => `${i.compania}|${i.ruta}|${i.numero}`;

function InventarioCard({ inventario, onPress }) {
  const e = ESTADOS[inventario.estado];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [h.card, { borderLeftColor: e.color }, pressed && h.pressed]}>
      <View style={h.cardTexts}>
        <Text style={h.cardNumero} numberOfLines={1}>{inventario.numero}</Text>
        <View style={h.cardMeta}>
          <Feather name="calendar" size={12} color={colors.textMuted} />
          <Text style={h.cardMetaText}>{formatFechaDoc(inventario.fecha) || '—'}</Text>
          <Text style={h.cardMetaText}>
            · {inventario.articulos} {inventario.articulos === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
      </View>
      <View style={h.cardDerecha}>
        <Etiqueta texto={e.texto} tono={e.tono} />
      </View>
      <Feather name="chevron-right" size={18} color={colors.textDisabled} />
    </Pressable>
  );
}

// Inventarios del cliente que están en el equipo (los hechos aquí y los descargados en Datos > Cargar
// datos: pendientes de procesar y de los últimos 30 días), con su estado. Al tocar uno se ven sus datos
// y lo contado por artículo.
// - Menú Consultar > Inventario (cliente validado): permiteCapturar = true. Botón "Nuevo inventario"
//   (abre la captura, InventarioClienteView) y los que siguen sin enviar se pueden descartar.
// - Pestaña Consulta > Inventario (sin validar): solo para ver.
export default function ConsultaInventariosView({ cliente, ruta, permiteCapturar = false, onBack }) {
  const insets = useSafeAreaInsets();
  const [inventarios, setInventarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [cargandoLineas, setCargandoLineas] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [ocupado, setOcupado] = useState(false);
  // true = captura de un inventario nuevo abierta.
  const [capturando, setCapturando] = useState(false);

  const leer = useCallback(
    () =>
      getInventariosCliente(cliente.codigo)
        .then(setInventarios)
        .catch((e) => setError(e?.message || 'No se pudieron leer los inventarios.')),
    [cliente.codigo]
  );

  useEffect(() => {
    setCargando(true);
    leer().finally(() => setCargando(false));
  }, [leer]);

  const inventario = inventarios.find((i) => clave(i) === seleccionado) ?? null;

  useEffect(() => {
    if (!inventario) {
      setLineas([]);
      return undefined;
    }
    let cancelado = false;
    setCargandoLineas(true);
    getLineasInventario(inventario.compania, inventario.ruta, inventario.numero)
      .then((lista) => {
        if (!cancelado) setLineas(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los artículos del inventario.');
      })
      .finally(() => {
        if (!cancelado) setCargandoLineas(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccionado]);

  const pagina = useMemo(
    () => inventarios.slice((page - 1) * pageSize, page * pageSize),
    [inventarios, page, pageSize]
  );
  const descartable =
    permiteCapturar && inventario && (inventario.estado === 'pendiente' || inventario.estado === 'error');

  const descartar = () => {
    if (!inventario || ocupado) return;
    Alert.alert(
      'Descartar inventario',
      `¿Seguro que deseas borrar el inventario ${inventario.numero} del equipo? No se enviará y su número queda sin usar.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            setOcupado(true);
            try {
              await descartarInventario(inventario.compania, inventario.ruta, inventario.numero);
              setSeleccionado(null);
              await leer();
            } catch (e) {
              Alert.alert('No se pudo descartar', e?.message || 'Error al borrar de la base local.');
            } finally {
              setOcupado(false);
            }
          },
        },
      ]
    );
  };

  if (capturando) {
    return (
      <InventarioClienteView
        cliente={cliente}
        ruta={ruta}
        onBack={() => setCapturando(false)}
        onGuardado={async (numero) => {
          setCapturando(false);
          await leer();
          Alert.alert('Inventario guardado', `Se guardó el inventario ${numero} en el equipo. Envíalo en Datos > Enviar Datos.`);
        }}
      />
    );
  }

  return (
    <View style={[h.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader
        title="Inventarios del cliente"
        info={
          permiteCapturar
            ? 'Inventarios del cliente y su estado. Usa Nuevo inventario para contar lo que tiene de cada artículo. Toca uno para ver lo contado; los que siguen sin enviar se pueden descartar.'
            : 'Inventarios que se le han hecho al cliente y su estado. Toca uno para ver lo contado por artículo. Para hacer uno nuevo, valida al cliente y entra a Menú Consultar > Inventario.'
        }
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={h.content}>
        <ClienteHistorialCard cliente={cliente} ruta={ruta} />
        {error ? <Text style={h.error}>{error}</Text> : null}

        {permiteCapturar ? (
          <Pressable onPress={() => setCapturando(true)} style={({ pressed }) => [styles.nuevo, pressed && h.pressed]}>
            <Feather name="plus" size={18} color={colors.onPrimary} />
            <Text style={styles.nuevoText}>Nuevo inventario</Text>
          </Pressable>
        ) : null}

        {inventarios.length ? (
          <View style={h.lista}>
            <Text style={h.contador}>
              {inventarios.length} {inventarios.length === 1 ? 'inventario' : 'inventarios'}
            </Text>
            {pagina.map((i) => (
              <InventarioCard key={clave(i)} inventario={i} onPress={() => setSeleccionado(clave(i))} />
            ))}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={inventarios.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </View>
        ) : (
          <View style={h.empty}>
            {cargando ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="archive" size={28} color={colors.textDisabled} />
            )}
            <Text style={h.emptyText}>
              {cargando
                ? 'Cargando los inventarios...'
                : permiteCapturar
                  ? 'Este cliente no tiene inventarios en el equipo. Usa "Nuevo inventario" para hacer uno.'
                  : 'Este cliente no tiene inventarios en el equipo. Se hacen validando al cliente, en Menú Consultar > Inventario.'}
            </Text>
          </View>
        )}
      </ScrollView>

      <DetalleSheet
        visible={Boolean(inventario)}
        tipo="INVENTARIO"
        numero={inventario?.numero}
        etiquetas={
          inventario ? <Etiqueta texto={ESTADOS[inventario.estado].texto} tono={ESTADOS[inventario.estado].tono} /> : null
        }
        onClose={() => setSeleccionado(null)}
      >
        {inventario ? (
          <>
            {inventario.errorEnvio ? <Text style={h.avisoError}>{inventario.errorEnvio}</Text> : null}
            <View style={h.datos}>
              <Dato label="Fecha" value={formatFechaHora(inventario.fecha)} />
              <Dato label="Inicio" value={formatFechaHora(inventario.inicio)} />
              <Dato label="Fin" value={formatFechaHora(inventario.fin)} />
              <Dato label="Artículos contados" value={String(inventario.articulos)} />
              <Dato label="Ruta" value={inventario.ruta} />
            </View>
            {descartable ? (
              <Pressable
                onPress={descartar}
                disabled={ocupado}
                style={({ pressed }) => [styles.descartar, (pressed || ocupado) && h.pressed]}
              >
                <Feather name="trash-2" size={16} color={colors.error} />
                <Text style={styles.descartarText}>Descartar</Text>
              </Pressable>
            ) : null}
            {cargandoLineas ? (
              <ActivityIndicator color={colors.primary} style={h.loading} />
            ) : (
              <InventarioLineasTable lineas={lineas} />
            )}
          </>
        ) : null}
      </DetalleSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  nuevo: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  nuevoText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  descartar: {
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  descartarText: { fontSize: 14, fontWeight: '700', color: colors.error },
});
