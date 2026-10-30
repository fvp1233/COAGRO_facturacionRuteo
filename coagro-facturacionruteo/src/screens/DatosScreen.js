import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { syncClientes } from '../services/syncClientes';
import { syncClientesCia } from '../services/syncClientesCia';
import { syncArticulos } from '../services/syncArticulos';
import { syncCobros, syncCobrosAgente } from '../services/syncCobros';
import { syncConsecutivos } from '../services/syncConsecutivos';
import { refrescarSesion } from '../services/mobileAuth';
import { contarPendientes, enviarPendientes } from '../services/enviarDatos';
import { isNetworkError } from '../services/api';
import { esErrorVinculada } from '../services/deviceFirma';
import FirmaEquipo from '../components/ui/FirmaEquipo';
import { contarClientes, getUltimaSincronizacion } from '../repositories/clientes';
import { contarArticulos } from '../repositories/articulos';
import { colors, radius, spacing } from '../theme';

const ACCENT = colors.primary;

const ACTIONS = [
  { id: 'cargar', title: 'Cargar datos', subtitle: 'Descargar datos desde el servidor', icon: 'download-cloud' },
  { id: 'enviar', title: 'Enviar Datos', subtitle: 'Enviar al servidor lo registrado', icon: 'upload-cloud' },
  { id: 'archivos', title: 'Actualizar Archivos', subtitle: 'Actualizar catálogos y archivos', icon: 'refresh-cw' },
];

function formatFecha(iso) {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Nunca';
  return d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

// Sincronización de datos.
// - "Enviar Datos" sube lo registrado en el equipo (ubicaciones, visitas, pedidos y consecutivos).
// - "Cargar datos" primero envía lo pendiente y SOLO si todo quedó en el servidor borra las tablas
//   locales y las vuelve a llenar con las del sistema en línea (si no, lo pendiente se perdería).
export default function DatosScreen({ module, onBack }) {
  const insets = useSafeAreaInsets();
  const [ultima, setUltima] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalArticulos, setTotalArticulos] = useState(0);
  const [pendientes, setPendientes] = useState(0);
  // Acción en curso: 'cargar' | 'enviar' | null.
  const [accion, setAccion] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [envio, setEnvio] = useState('');
  const [errores, setErrores] = useState([]);
  const [error, setError] = useState('');
  const [vinculada, setVinculada] = useState(false);

  const refrescar = useCallback(async () => {
    try {
      setUltima(await getUltimaSincronizacion());
      setTotal(await contarClientes());
      setTotalArticulos(await contarArticulos());
      setPendientes((await contarPendientes()).total);
    } catch {
      // si la base falla, el error se mostrará al cargar datos
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const limpiar = () => {
    setError('');
    setVinculada(false);
    setResumen(null);
    setEnvio('');
    setErrores([]);
  };

  const mostrarError = (e, sinRed) => {
    // La renovación del token se intenta una sola vez; si la handheld ya está ligada a otro
    // equipo, se detiene aquí y se muestra la firma de este equipo.
    setVinculada(esErrorVinculada(e));
    setError(isNetworkError(e) ? sinRed : e?.message || 'Ocurrió un error.');
  };

  // Envía lo pendiente. Devuelve { todo: true si todo quedó en el servidor, enviados }.
  const enviar = async () => {
    const { enviados, errores: fallidos } = await enviarPendientes();
    setErrores(fallidos);
    if (enviados) setEnvio(`Se enviaron ${enviados} ${enviados === 1 ? 'registro' : 'registros'} al servidor.`);
    return { todo: fallidos.length === 0, enviados };
  };

  const enviarDatos = async () => {
    if (accion) return;
    setAccion('enviar');
    limpiar();
    try {
      const { todo, enviados } = await enviar();
      if (todo && !enviados) setEnvio('No hay datos pendientes de enviar.');
      if (!todo) setError('Algunos registros no se enviaron. Revisa los errores e intenta de nuevo.');
    } catch (e) {
      mostrarError(e, 'No se pudo enviar, intenta de nuevo. Revisa tu conexión a internet.');
    } finally {
      await refrescar();
      setAccion(null);
    }
  };

  const cargarDatos = async () => {
    if (accion) return;
    setAccion('cargar');
    limpiar();
    try {
      // Valida el token (renovándolo si venció) y actualiza las rutas de la handheld antes de bajar datos.
      await refrescarSesion();
      // Primero se sube lo pendiente: la carga borra las tablas locales.
      if (!(await enviar()).todo) {
        setError(
          'No se cargaron los datos: el servidor rechazó algunos registros. Corrígelos y vuelve a intentar; la carga borraría lo que está pendiente.'
        );
        return;
      }
      // Cuando haya más tablas, se llaman aquí una tras otra.
      const clientes = await syncClientes();
      const clientesCia = await syncClientesCia();
      const articulos = await syncArticulos();
      const cobros = await syncCobros();
      const cobrosAgente = await syncCobrosAgente();
      const consecutivos = await syncConsecutivos();
      setResumen({
        ...clientes,
        clientesCia: clientesCia.clientesCia,
        articulos: articulos.articulos,
        precios: articulos.precios,
        documentos: cobros.documentos,
        documentosAgente: cobrosAgente.documentos,
        consecutivos: consecutivos.consecutivos,
        omitidos: clientes.omitidos + clientesCia.omitidos + articulos.omitidos + cobros.omitidos + cobrosAgente.omitidos + consecutivos.omitidos,
      });
    } catch (e) {
      mostrarError(e, 'Debes estar conectado a internet para enviar y descargar los datos. Revisa tu conexión e intenta de nuevo.');
    } finally {
      // Aunque falle una tabla, las que sí se guardaron se reflejan en los contadores.
      await refrescar();
      setAccion(null);
    }
  };

  const handlePress = (action) => {
    if (action.id === 'cargar') {
      cargarDatos();
    } else if (action.id === 'enviar') {
      enviarDatos();
    } else {
      Alert.alert(action.title, 'Próximamente.');
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.back}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{module?.title ?? 'Datos'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.statusCard}>
          <Text style={styles.line}>
            Última carga: <Text style={styles.bold}>{formatFecha(ultima)}</Text>
          </Text>
          <Text style={styles.line}>
            Clientes guardados: <Text style={styles.bold}>{total}</Text>
          </Text>
          <Text style={styles.line}>
            Artículos guardados: <Text style={styles.bold}>{totalArticulos}</Text>
          </Text>
          <Text style={styles.line}>
            Pendientes de enviar: <Text style={[styles.bold, pendientes > 0 && styles.pendiente]}>{pendientes}</Text>
          </Text>
        </View>

        {ACTIONS.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => handlePress(action)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <View style={styles.iconWrap}>
              <Feather name={action.icon} size={24} color={colors.onPrimary} />
            </View>
            <View style={styles.texts}>
              <Text style={styles.buttonTitle}>{action.title}</Text>
              <Text style={styles.buttonSubtitle}>{action.subtitle}</Text>
            </View>
            {accion === action.id ? (
              <ActivityIndicator color={ACCENT} />
            ) : (
              <Feather name="chevron-right" size={20} color={colors.textDisabled} />
            )}
          </Pressable>
        ))}

        {envio ? (
          <View style={[styles.message, styles.ok]}>
            <Text style={styles.okText}>{envio}</Text>
          </View>
        ) : null}

        {resumen ? (
          <View style={[styles.message, styles.ok]}>
            <Text style={styles.okText}>
              Carga completa: {resumen.clientes} clientes, {resumen.clientesCia} datos comerciales, {resumen.rutas} rutas, {resumen.asignaciones} asignaciones, {resumen.articulos} artículos, {resumen.precios} precios, {resumen.documentos} documentos por cobrar ({resumen.documentosAgente} tuyos), {resumen.consecutivos} consecutivos de ruta.
              {resumen.omitidos > 0 ? ` (${resumen.omitidos} filas omitidas por datos incompletos)` : ''}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.message, styles.fail]}>
            <Text style={styles.failText}>{error}</Text>
            {errores.map((e, i) => (
              <Text key={i} style={styles.failItem}>
                • {e.tipo} {e.registro}: {e.error}
              </Text>
            ))}
          </View>
        ) : null}

        {vinculada ? <FirmaEquipo label="Firma de este equipo (compártela con soporte)" /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  list: {
    gap: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
  buttonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  statusCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  line: { fontSize: 13, color: colors.textMuted },
  bold: { fontWeight: '700', color: colors.text },
  message: { borderRadius: radius.md, padding: spacing.md },
  ok: { backgroundColor: colors.surface },
  okText: { fontSize: 13, color: colors.success },
  fail: { backgroundColor: colors.errorSoft },
  failText: { fontSize: 13, color: colors.error },
  failItem: { fontSize: 12, color: colors.error, marginTop: 4 },
  pendiente: { color: colors.warning },
  buttonSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
