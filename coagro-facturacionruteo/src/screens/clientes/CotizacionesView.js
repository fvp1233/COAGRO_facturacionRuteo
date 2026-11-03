import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import AprobarCotizacionModal from '../../components/pedido/AprobarCotizacionModal';
import CenteredHeader from '../../components/ui/CenteredHeader';
import DataTable from '../../components/ui/DataTable';
import { aprobarCotizacion, getCotizacionesCliente } from '../../repositories/pedidos';
import { isNetworkError } from '../../services/api';
import { descargarCotizacionPdf } from '../../services/documentoPdf';
import { formatFechaDoc, formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const COLUMNS = [
  { key: 'numero', title: 'Número', width: 110, grow: true },
  { key: 'fechaTexto', title: 'Fecha', width: 80 },
  { key: 'articulos', title: 'Art.', width: 50, align: 'right' },
  { key: 'totalTexto', title: 'Total', width: 110, align: 'right' },
];

const ACCENT = colors.primary;

const aFila = (c) => ({
  ...c,
  fechaTexto: formatFechaDoc(c.fecha),
  totalTexto: formatMontoMoneda(c.total, c.moneda),
});

// Validar cliente > Cotización: cotizaciones del cliente (capturadas en el equipo y descargadas en
// Datos > Cargar datos). "Nueva" abre la captura (mismas pantallas del pedido); al seleccionar una
// se puede aprobar: pasa a pedido (TIP_DOC 'F') con fecha de hoy y la entrega que se elija, o
// imprimir: descarga su PDF del backend (requiere internet y que la cotización ya esté enviada).
// onNueva(): abrir la captura. onAprobada(numero): el contenedor registra la visita.
export default function CotizacionesView({ cliente, ruta, onBack, onNueva, onAprobada }) {
  const insets = useSafeAreaInsets();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [aprobar, setAprobar] = useState(false);
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(
    () =>
      getCotizacionesCliente(cliente.codigo, ruta)
        .then((lista) => {
          setCotizaciones(lista.map(aFila));
          setError('');
        })
        .catch((e) => setError(e?.message || 'No se pudieron leer las cotizaciones.')),
    [cliente.codigo, ruta]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cotizacion = cotizaciones.find((c) => c.numero === seleccionado) ?? null;

  const imprimir = async () => {
    if (!cotizacion || generando) return;
    if (!cotizacion.enviada) {
      Alert.alert(
        'Imprimir cotización',
        `La cotización ${cotizacion.numero} aún no está en el servidor. Envíala en Datos > Enviar Datos y vuelve a intentar.`
      );
      return;
    }
    setGenerando(true);
    try {
      await descargarCotizacionPdf(cotizacion.compania, cotizacion.numero);
    } catch (e) {
      Alert.alert(
        'No se pudo descargar el PDF',
        isNetworkError(e)
          ? 'Debes estar conectado a internet para descargar el PDF de la cotización.'
          : e?.message || 'Intenta de nuevo.'
      );
    } finally {
      setGenerando(false);
    }
  };

  const handleAprobar = async (entrega) => {
    try {
      await aprobarCotizacion({ ruta, numero: cotizacion.numero, entrega, fecha: new Date() });
    } catch (e) {
      Alert.alert('No se pudo aprobar la cotización', e?.message || 'Error al actualizar la base local.');
      return;
    }
    const numero = cotizacion.numero;
    setAprobar(false);
    setSeleccionado(null);
    await cargar();
    Alert.alert('Cotización aprobada', `La cotización ${numero} pasó a pedido. Se subirá en Enviar Datos.`);
    await onAprobada?.(numero);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Cotizaciones" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
        </View>

        <DataTable
          columns={COLUMNS}
          data={cotizaciones}
          keyExtractor={(item) => item.numero}
          onRowPress={(item) => setSeleccionado(item.numero)}
          selectedKey={seleccionado}
          emptyText="El cliente no tiene cotizaciones pendientes"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          onPress={onNueva}
          style={({ pressed }) => [styles.action, styles.secondary, pressed && styles.pressed]}
        >
          <Feather name="plus" size={20} color={ACCENT} />
          <Text style={[styles.actionText, styles.secondaryText]}>Nueva</Text>
        </Pressable>
        <Pressable
          onPress={imprimir}
          disabled={!cotizacion || generando}
          style={({ pressed }) => [styles.action, styles.secondary, (pressed || !cotizacion) && styles.pressed]}
        >
          {generando ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Feather name="printer" size={20} color={ACCENT} />
          )}
          <Text style={[styles.actionText, styles.secondaryText]}>Imprimir</Text>
        </Pressable>
        <Pressable
          onPress={() => setAprobar(true)}
          disabled={!cotizacion}
          style={({ pressed }) => [styles.action, (pressed || !cotizacion) && styles.pressed]}
        >
          <Feather name="check-circle" size={20} color={colors.onPrimary} />
          <Text style={styles.actionText}>Aprobar</Text>
        </Pressable>
      </View>

      <AprobarCotizacionModal
        visible={aprobar && !!cotizacion}
        cliente={cliente}
        cotizacion={cotizacion}
        onAprobar={handleAprobar}
        onClose={() => setAprobar(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  error: { fontSize: 12, color: colors.error },
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondary: { backgroundColor: colors.primarySoft },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  secondaryText: { color: ACCENT },
  pressed: { opacity: 0.6 },
});
