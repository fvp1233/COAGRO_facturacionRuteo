import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import { getClienteConsulta } from '../../repositories/clientes';
import {
  CAMPOS_CLIENTE,
  getCamposPendientes,
  getOpcionesEdicion,
  guardarCambiosCliente,
  validarValor,
} from '../../repositories/clienteCambios';
import { enviarPendientes } from '../../services/enviarDatos';
import { isNetworkError } from '../../services/api';
import { formatCantidad, formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const NO_DISPONIBLE = 'No disponible';
const VACIO = '(vacío)';
const SIN_SELECCION = 'Seleccionar';

// Contacto / teléfono: pueden venir null, " " o "ND" desde el ERP.
const textoOSin = (v, sin) => {
  const t = String(v ?? '').trim();
  return !t || t.toUpperCase() === 'ND' ? sin : t;
};

// DIA_CRE: 0 = contado.
const diasCredito = (n) => (n == null ? null : Number(n) === 0 ? 'Contado' : `${n} días`);

// IND_MON: L = local, D = dólar.
const moneda = (v) => {
  const m = String(v ?? '').trim().toUpperCase();
  if (!m) return null;
  if (m.startsWith('L')) return 'Local';
  if (m.startsWith('D')) return 'Dólar';
  return m;
};

const etiquetaOpcion = (o) => (o.descripcion && o.descripcion !== o.codigo ? `${o.codigo} - ${o.descripcion}` : o.codigo);

// Código con su nombre para la ficha: "01 - SAN SALVADOR" (o solo el código si no está en el catálogo).
const codigoYNombre = (codigo, nombre) => (codigo ? (nombre ? `${codigo} - ${nombre}` : codigo) : null);


// Valor crudo de cada campo editable (de la base local), el que se carga en el formulario.
const VALOR_CRUDO = {
  NOM_CLT: (d) => d.nombre,
  DIR_CLT: (d) => d.direccion,
  NOM_CTO: (d) => d.contacto,
  NUM_TEL: (d) => d.telefono,
  codActividad: (d) => d.actividadCodigoPropio,
  desActividad: (d) => d.actividadDescripcionPropia,
  nomEncargadoCompras: (d) => d.encargadoCompras,
  telEncargadoCompras: (d) => d.telefonoCompras,
  nomEncargadoPagos: (d) => d.encargadoPagos,
  telEncargadoPagos: (d) => d.telefonoPagos,
  COD_TIP_CL: (d) => d.tipoClienteCodigo,
  NIVEL_PRECIO: (d) => d.nivelPrecio,
  DIVISION_GEOGRAFICA1: (d) => d.division1,
  DIVISION_GEOGRAFICA2: (d) => d.division2,
  DIVISION_GEOGRAFICA3: (d) => d.division3,
  DIA_CRE: (d) => d.diasCredito,
  LIM_CRE: (d) => d.limiteCredito,
  POR_EXC_VT: (d) => d.exentoVentas,
  POR_EXC_CS: (d) => d.exentoSelectivo,
  IND_MON: (d) => (d.moneda ? String(d.moneda).trim().toUpperCase().charAt(0) : null),
  DESCUENTO: (d) => d.descuento,
};

// Formulario inicial: textos y números como texto, códigos tal cual, días como lista.
function armarBorrador(datos) {
  const borrador = {};
  for (const [campo, def] of Object.entries(CAMPOS_CLIENTE)) {
    const v = VALOR_CRUDO[campo](datos);
    if (def.tipo === 'opciones') borrador[campo] = v ?? null;
    else borrador[campo] = v === null || v === undefined ? '' : String(v);
  }
  return borrador;
}

// Valor legible para la confirmación.
function mostrar(def, valor, opciones = []) {
  if (valor === null || valor === undefined || valor === '') return VACIO;
  if (def.tipo === 'opciones') {
    const o = opciones.find((x) => x.codigo === valor);
    return o ? etiquetaOpcion(o) : String(valor);
  }
  if (def.tipo === 'porcentaje') return `${formatCantidad(valor)}%`;
  if (def.tipo === 'numero' || def.tipo === 'entero') return formatCantidad(valor);
  return String(valor);
}

const iguales = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Menú Consultar > Cliente: ficha del cliente (base local; se descarga en Datos > Cargar datos).
// El lápiz del encabezado habilita la edición de los datos del cliente (menos el código, los días
// de visita, que son de la ruta, y facturas pendientes, que se calcula). Al guardar se pide
// confirmación con la lista de cambios, se
// guardan en la base local y se envían al servidor; si no hay conexión quedan pendientes para
// Datos > Enviar datos.
export default function ConsultaClienteView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pendientes, setPendientes] = useState(new Set());
  const [catalogos, setCatalogos] = useState({});
  // Modo edición: borrador = valores del formulario; inicial = los que tenía al abrirlo.
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({});
  const [inicial, setInicial] = useState({});
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  // Resultado del último guardado: { tipo: 'ok' | 'aviso', texto }.
  const [aviso, setAviso] = useState(null);

  const leer = useCallback(async () => {
    const [d, p, c] = await Promise.all([
      getClienteConsulta(cliente.codigo, ruta),
      getCamposPendientes(cliente.codigo),
      getOpcionesEdicion(),
    ]);
    setDatos(d);
    setPendientes(p);
    setCatalogos(c);
    return d;
  }, [cliente.codigo, ruta]);

  useEffect(() => {
    let cancelado = false;
    leer()
      .then((d) => {
        if (!cancelado && !d) setError('El cliente no está en la base local. Descarga los datos en Datos > Cargar datos.');
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer el cliente de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [leer]);

  // Los datos de CLIENTE_CIA solo se editan si el cliente tiene fila (datos comerciales).
  const esEditable = (campo) => CAMPOS_CLIENTE[campo].tabla !== 'CLIENTE_CIA' || Boolean(datos?.tieneDatosComerciales);

  // Opciones de un campo 'opciones'. Si el valor del cliente no está en el catálogo se agrega solo
  // con su código para no perderlo.
  const opcionesDe = (campo, valores) => {
    const lista = catalogos[CAMPOS_CLIENTE[campo].catalogo] ?? [];
    const actual = valores[campo];
    return actual && !lista.some((o) => o.codigo === actual) ? [{ codigo: actual, descripcion: null }, ...lista] : lista;
  };

  // Etiqueta de un campo en pantalla: las divisiones usan las del país (alFAC_PAIS) si las tiene.
  const etiquetaCampo = (campo) => {
    if (campo === 'DIVISION_GEOGRAFICA1' && datos?.etiquetaDivision1) return datos.etiquetaDivision1;
    if (campo === 'DIVISION_GEOGRAFICA2' && datos?.etiquetaDivision2) return datos.etiquetaDivision2;
    return CAMPOS_CLIENTE[campo].etiqueta;
  };

  const empezarEdicion = () => {
    const b = armarBorrador(datos);
    setBorrador(b);
    setInicial(b);
    setErrores({});
    setAviso(null);
    setEditando(true);
  };

  const cancelarEdicion = () => {
    setEditando(false);
    setErrores({});
  };

  const cambiar = (campo, valor) => {
    setBorrador((b) => ({ ...b, [campo]: valor }));
    setErrores((e) => (e[campo] ? { ...e, [campo]: undefined } : e));
  };

  const guardarYEnviar = async (cambios) => {
    setGuardando(true);
    try {
      await guardarCambiosCliente(cliente.codigo, cambios);
    } catch (e) {
      setGuardando(false);
      Alert.alert('No se guardaron los cambios', e?.message || 'No se pudo guardar en la base local.');
      return;
    }
    setEditando(false);
    // Ya están en la base local; se intenta enviarlos de una vez (solo los cambios del cliente).
    try {
      const { errores: fallidos } = await enviarPendientes({ solo: 'cambiosCliente' });
      setAviso(
        fallidos.length
          ? {
              tipo: 'aviso',
              texto: `Se guardaron los cambios, pero el servidor rechazó ${fallidos.length}: ${fallidos
                .map((f) => `${f.registro} (${f.error})`)
                .join('; ')}`,
            }
          : { tipo: 'ok', texto: 'Cambios guardados y enviados al servidor.' }
      );
    } catch (e) {
      setAviso({
        tipo: 'aviso',
        texto: isNetworkError(e)
          ? 'Cambios guardados en el equipo. No hay conexión: se enviarán con Datos > Enviar datos.'
          : `Cambios guardados en el equipo, pero no se pudieron enviar (${e?.message || 'error del servidor'}). Se enviarán con Datos > Enviar datos.`,
      });
    }
    try {
      await leer();
    } finally {
      setGuardando(false);
    }
  };

  const guardar = () => {
    // Solo se validan y guardan los campos que se tocaron.
    const cambios = [];
    const nuevosErrores = {};
    for (const campo of Object.keys(CAMPOS_CLIENTE)) {
      if (!esEditable(campo) || iguales(borrador[campo], inicial[campo])) continue;
      const { valor, error: problema } = validarValor(campo, borrador[campo]);
      if (problema) {
        nuevosErrores[campo] = problema;
        continue;
      }
      const def = CAMPOS_CLIENTE[campo];
      const crudo = VALOR_CRUDO[campo](datos);
      const anterior = def.tipo === 'texto' ? String(crudo ?? '').trim() : crudo;
      if (!iguales(anterior, valor)) cambios.push({ campo, valor, anterior });
    }
    if (Object.keys(nuevosErrores).length) {
      setErrores(nuevosErrores);
      Alert.alert('Revisa los datos', Object.values(nuevosErrores).join('\n'));
      return;
    }
    if (!cambios.length) {
      setEditando(false);
      return;
    }
    const lista = cambios
      .map(({ campo, valor, anterior }) => {
        const def = CAMPOS_CLIENTE[campo];
        const antes = def.catalogo ? opcionesDe(campo, inicial) : [];
        const ahora = def.catalogo ? opcionesDe(campo, borrador) : [];
        return `• ${etiquetaCampo(campo)}: ${mostrar(def, anterior, antes)} → ${mostrar(def, valor, ahora)}`;
      })
      .join('\n');
    Alert.alert(
      'Confirmar cambios',
      `¿Seguro que deseas cambiar ${cambios.length === 1 ? 'este dato' : `estos ${cambios.length} datos`} del cliente?\n\n${lista}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, cambiar', onPress: () => guardarYEnviar(cambios) },
      ]
    );
  };

  // Un dato: en lectura muestra el texto; en edición, su control (si el campo es editable).
  // Es una función (no un componente) para que los TextInput no se vuelvan a montar al escribir.
  const dato = (label, valor, campo, { style, lines = 2 } = {}) => {
    const def = campo ? CAMPOS_CLIENTE[campo] : null;
    const enEdicion = editando && def && esEditable(campo);
    const pendiente = campo && pendientes.has(campo) && !editando;
    const err = campo ? errores[campo] : null;
    let control;

    if (enEdicion && def.tipo === 'opciones') {
      const opciones = opcionesDe(campo, borrador);
      const actual = opciones.find((o) => o.codigo === borrador[campo]);
      control = (
        <SelectField
          value={actual ? etiquetaOpcion(actual) : borrador[campo] ?? SIN_SELECCION}
          options={opciones.map(etiquetaOpcion)}
          onChange={(texto) => cambiar(campo, opciones.find((o) => etiquetaOpcion(o) === texto)?.codigo ?? null)}
        />
      );
    } else if (enEdicion) {
      control = (
        <TextInput
          style={[styles.input, def.multilinea && styles.inputMulti, err && styles.inputError]}
          value={borrador[campo] ?? ''}
          onChangeText={(t) => cambiar(campo, t)}
          multiline={Boolean(def.multilinea)}
          keyboardType={
            def.tipo === 'texto' ? def.teclado ?? 'default' : def.tipo === 'entero' ? 'number-pad' : 'decimal-pad'
          }
          placeholder={def.etiqueta}
          placeholderTextColor={colors.textDisabled}
        />
      );
    } else {
      const vacio = valor === null || valor === undefined || valor === '';
      control = (
        <View style={[styles.readonly, pendiente && styles.readonlyPendiente]}>
          <Text style={[styles.value, vacio && styles.vacio]} numberOfLines={lines}>
            {vacio ? NO_DISPONIBLE : String(valor)}
          </Text>
        </View>
      );
    }

    return (
      <View style={style}>
        <Text style={styles.label}>
          {label}
          {pendiente ? <Text style={styles.pendiente}>  · sin enviar</Text> : null}
        </Text>
        {control}
        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader
        title={editando ? 'Editar cliente' : 'Cliente'}
        onBack={editando ? cancelarEdicion : onBack}
        rightIcon={datos && !guardando ? (editando ? 'x' : 'edit-2') : null}
        rightColor={colors.primary}
        onRight={editando ? cancelarEdicion : empezarEdicion}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {cargando ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {error ? <Text style={styles.warning}>{error}</Text> : null}
        {aviso ? <Text style={aviso.tipo === 'ok' ? styles.ok : styles.warning}>{aviso.texto}</Text> : null}

        {datos ? (
          <>
            {editando && !datos.tieneDatosComerciales ? (
              <Text style={styles.ayuda}>
                El cliente no tiene datos comerciales en la base local: solo se pueden cambiar nombre, dirección y
                nivel de precio.
              </Text>
            ) : null}

            <View style={styles.card}>
              {dato('Código', datos.codigo)}
              {dato('Nombre', datos.nombre, 'NOM_CLT')}
              {dato('Dirección', datos.direccion, 'DIR_CLT', { lines: 3 })}
              <View style={styles.row}>
                {dato(
                  'Contacto',
                  datos.tieneDatosComerciales ? textoOSin(datos.contacto, 'Sin contacto') : null,
                  'NOM_CTO',
                  { style: styles.half }
                )}
                {dato(
                  'Teléfono',
                  datos.tieneDatosComerciales ? textoOSin(datos.telefono, 'Sin teléfono') : null,
                  'NUM_TEL',
                  { style: styles.half }
                )}
              </View>
            </View>

            <View style={styles.card}>
              {dato('Código de actividad', textoOSin(datos.actividadCodigo, null), 'codActividad')}
              {dato('Descripción de actividad', datos.actividadDescripcion, 'desActividad', { lines: 3 })}
            </View>

            <View style={styles.card}>
              {dato(
                etiquetaCampo('DIVISION_GEOGRAFICA1'),
                codigoYNombre(datos.division1, datos.nombreDivision1),
                'DIVISION_GEOGRAFICA1'
              )}
              {dato(
                etiquetaCampo('DIVISION_GEOGRAFICA2'),
                codigoYNombre(datos.division2, datos.nombreDivision2),
                'DIVISION_GEOGRAFICA2'
              )}
              {dato(
                etiquetaCampo('DIVISION_GEOGRAFICA3'),
                codigoYNombre(datos.division3, datos.nombreDivision3),
                'DIVISION_GEOGRAFICA3'
              )}
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                {dato('Encargado de compras', textoOSin(datos.encargadoCompras, null), 'nomEncargadoCompras', {
                  style: styles.half,
                })}
                {dato('Teléfono compras', textoOSin(datos.telefonoCompras, null), 'telEncargadoCompras', {
                  style: styles.half,
                })}
              </View>
              <View style={styles.row}>
                {dato('Encargado de pagos', textoOSin(datos.encargadoPagos, null), 'nomEncargadoPagos', {
                  style: styles.half,
                })}
                {dato('Teléfono pagos', textoOSin(datos.telefonoPagos, null), 'telEncargadoPagos', {
                  style: styles.half,
                })}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                {dato('Tipo cliente', datos.tipoCliente ?? datos.tipoClienteCodigo, 'COD_TIP_CL', { style: styles.half })}
                {dato('Nivel de precio', datos.nivelPrecio, 'NIVEL_PRECIO', { style: styles.half })}
              </View>
              {/* Los días de visita son de la ruta: solo lectura. */}
              {dato('Día de visita', datos.diasVisita.join(', '))}
              <View style={styles.row}>
                {dato('Días de crédito', diasCredito(datos.diasCredito), 'DIA_CRE', { style: styles.half })}
                {dato('Límite de crédito', formatMonto(datos.limiteCredito), 'LIM_CRE', { style: styles.half })}
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                {dato('Exento imp. ventas', formatPorcentaje(datos.exentoVentas), 'POR_EXC_VT', { style: styles.half })}
                {dato('Exento imp. selec. cons.', formatPorcentaje(datos.exentoSelectivo), 'POR_EXC_CS', {
                  style: styles.half,
                })}
              </View>
              <View style={styles.row}>
                {dato('Facturas pendientes', datos.facturasPendientes ? 'Sí' : 'No', null, { style: styles.half })}
                {dato('Tipo de moneda', moneda(datos.moneda), 'IND_MON', { style: styles.half })}
              </View>
              {dato('Desc. general', formatPorcentaje(datos.descuento), 'DESCUENTO')}
            </View>
          </>
        ) : null}
      </ScrollView>

      {editando ? (
        <View style={styles.bar}>
          <Pressable
            onPress={guardando ? undefined : cancelarEdicion}
            style={({ pressed }) => [styles.btn, styles.btnSecundario, pressed && styles.pressed]}
          >
            <Text style={styles.btnSecundarioTexto}>Cancelar</Text>
          </Pressable>
          <Pressable
            onPress={guardando ? undefined : guardar}
            style={({ pressed }) => [styles.btn, styles.btnPrimario, (pressed || guardando) && styles.pressed]}
          >
            {guardando ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnPrimarioTexto}>Guardar cambios</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  readonlyPendiente: { borderWidth: 1, borderColor: colors.warning },
  value: { fontSize: 14, color: colors.text },
  vacio: { color: colors.textDisabled, fontStyle: 'italic' },
  pendiente: { fontSize: 11, color: colors.warning, fontWeight: '600' },
  input: {
    minHeight: 42,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  error: { fontSize: 12, color: colors.error, marginTop: spacing.xs },
  ayuda: { fontSize: 12, color: colors.textMuted },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ok: {
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: { marginTop: spacing.lg },
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecundario: { backgroundColor: colors.surface },
  btnSecundarioTexto: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  btnPrimario: { backgroundColor: colors.primary },
  btnPrimarioTexto: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.7 },
});
