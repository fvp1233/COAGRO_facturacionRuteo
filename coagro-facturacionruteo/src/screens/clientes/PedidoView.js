import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import SelectField from '../../components/ui/SelectField';
import Checkbox from '../../components/ui/Checkbox';
import { armarEncabezado, faltantesEncabezado, getDatosPedido, TIPOS_PEDIDO } from '../../repositories/pedidos';
import { departamentosDe, distritosDe, municipiosDe, paisGeografico } from '../../utils/divisiones';
import { colors, radius, spacing } from '../../theme';

const ACCENT = colors.primary;
const SIN_SELECCION = 'Seleccionar';
const TIPOS_DOCUMENTO = ['Normal', 'Crédito fiscal'];

const etiqueta = (o) => (o.descripcion && o.descripcion !== o.codigo ? `${o.codigo} - ${o.descripcion}` : o.codigo);

// Si el valor del cliente no está en el catálogo (catálogo vacío o desactualizado), se agrega
// como opción solo con su código para no perderlo.
function conValorCliente(opciones, codigo) {
  if (!codigo || opciones.some((o) => o.codigo === codigo)) return opciones;
  return [{ codigo, descripcion: null }, ...opciones];
}

// Selector sobre opciones { codigo, descripcion }: muestra la etiqueta y devuelve el código.
function Selector({ label, opciones, valor, onChange }) {
  const actual = opciones.find((o) => o.codigo === valor);
  return (
    <SelectField
      label={label}
      value={actual ? etiqueta(actual) : SIN_SELECCION}
      options={opciones.map(etiqueta)}
      onChange={(texto) => onChange(opciones.find((o) => etiqueta(o) === texto)?.codigo ?? null)}
    />
  );
}

// Encabezado de un pedido nuevo: se precarga con los datos comerciales del cliente (CLIENTE_CIA) y
// se pueden cambiar con los catálogos descargados en Datos > Cargar datos.
// onContinuar(encabezado) recibe la selección (la siguiente pantalla se conecta en el contenedor).
// tipo: TIPOS_PEDIDO.pedido o TIPOS_PEDIDO.cotizacion (misma pantalla, cambia el título).
export default function PedidoView({ cliente, ruta, tipo = TIPOS_PEDIDO.pedido, onBack, onContinuar }) {
  const insets = useSafeAreaInsets();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [pais, setPais] = useState(null);
  // Divisiones (utils/divisiones): departamento -> municipio -> distrito. Al pedido van
  // COD_GEO1 = departamento y COD_GEO2 = municipio (el distrito no tiene columna en alFAC_ENC_PED).
  const [division1, setDivision1] = useState(null);
  const [division2, setDivision2] = useState(null);
  const [division3, setDivision3] = useState(null);
  const [condicionPago, setCondicionPago] = useState(null);
  const [nivelPrecio, setNivelPrecio] = useState(null);
  const [subtipo, setSubtipo] = useState(null);
  const [actividadComercial, setActividadComercial] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0]);
  const [sugeridoVenta, setSugeridoVenta] = useState(false);
  // Hora en que se abre el pedido (HOR_INI de alFAC_ENC_PED).
  const [inicio] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;
    getDatosPedido(cliente.codigo, ruta)
      .then((d) => {
        if (cancelado) return;
        setDatos(d);
        const c = d.cliente;
        if (!c) {
          setError('El cliente no tiene datos comerciales en la base local. Descarga los datos en Datos > Cargar datos.');
          return;
        }
        setPais(c.pais);
        setDivision1(c.division1);
        setDivision2(c.division2);
        setDivision3(c.division3);
        setCondicionPago(c.condicionPago);
        setNivelPrecio(c.nivelPrecio);
        setSubtipo(c.subtipo);
        setActividadComercial(c.actividadComercial);
      })
      .catch(() => {
        if (!cancelado) setError(`No se pudieron leer los datos ${tipo.del} de la base local.`);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  // País de las divisiones: COD_PAIS puede ser un vendedor ('VRR1'); entonces 'ESA'. El COD_PAIS
  // que va en el pedido no cambia.
  const paisDiv = datos ? paisGeografico(pais, datos.divisiones1) : null;

  const opciones = useMemo(() => {
    if (!datos) return null;
    const c = datos.cliente ?? {};
    const paisCliente = paisGeografico(c.pais, datos.divisiones1);
    // Los valores del cliente solo se conservan mientras sigan en su país / nivel superior.
    const mismoDepto = paisDiv === paisCliente && division1 === c.division1;
    const mismoMunicipio = mismoDepto && division2 === c.division2;
    return {
      paises: conValorCliente(datos.paises, c.pais),
      divisiones1: conValorCliente(
        departamentosDe(datos.divisiones1, paisDiv),
        paisDiv === paisCliente ? c.division1 : null
      ),
      municipios: conValorCliente(
        municipiosDe(datos.municipios, paisDiv, division1),
        mismoDepto ? c.division2 : null
      ),
      distritos: conValorCliente(
        distritosDe(datos.distritos, paisDiv, division1, division2),
        mismoMunicipio ? c.division3 : null
      ),
      condiciones: conValorCliente(datos.condiciones, c.condicionPago),
      niveles: conValorCliente(datos.niveles, c.nivelPrecio),
      subtipos: conValorCliente(datos.subtipos, c.subtipo),
      actividades: conValorCliente(datos.actividades, c.actividadComercial),
    };
  }, [datos, paisDiv, division1, division2]);

  // Si el país de las divisiones no cambia (p. ej. de un vendedor a otro, los dos 'ESA'), se conservan.
  const cambiarPais = (codigo) => {
    if (codigo === pais) return;
    setPais(codigo);
    if (paisGeografico(codigo, datos?.divisiones1) === paisDiv) return;
    setDivision1(null);
    setDivision2(null);
    setDivision3(null);
  };

  const cambiarDivision1 = (codigo) => {
    if (codigo === division1) return;
    setDivision1(codigo);
    setDivision2(null);
    setDivision3(null);
  };

  const cambiarMunicipio = (codigo) => {
    if (codigo === division2) return;
    setDivision2(codigo);
    setDivision3(null);
  };

  const continuar = () => {
    const valores = {
      pais,
      division1,
      division2,
      division3,
      condicionPago,
      nivelPrecio,
      subtipo,
      actividadComercial,
      creditoFiscal: tipoDocumento === 'Crédito fiscal',
      sugeridoVenta,
      inicio,
    };
    const faltan = faltantesEncabezado(valores);
    if (faltan.length) {
      Alert.alert('Datos incompletos', `Selecciona: ${faltan.join(', ')}.`);
      return;
    }
    onContinuar?.(armarEncabezado(datos, valores));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={`Datos del encabezado ${tipo.del}, llenados con los del cliente. Cámbialos solo si hace falta y continúa para agregar los artículos.`} title={tipo.titulo} onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.clientCard}>
          <View style={styles.clientIcon}>
            <MaterialCommunityIcons name="cart-plus" size={22} color={ACCENT} />
          </View>
          <View style={styles.clientTexts}>
            <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
            <Text style={styles.clientMeta} numberOfLines={1}>
              {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
            </Text>
          </View>
        </View>

        {cargando ? <ActivityIndicator color={ACCENT} style={styles.loading} /> : null}
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        {opciones ? (
          <>
            <View style={styles.card}>
              <Selector label="País" opciones={opciones.paises} valor={pais} onChange={cambiarPais} />
              <Selector
                label="Departamento"
                opciones={opciones.divisiones1}
                valor={division1}
                onChange={cambiarDivision1}
              />
              <Selector label="Municipio" opciones={opciones.municipios} valor={division2} onChange={cambiarMunicipio} />
              <Selector label="Distrito" opciones={opciones.distritos} valor={division3} onChange={setDivision3} />
            </View>

            <View style={styles.card}>
              <Selector
                label="Condición de pago"
                opciones={opciones.condiciones}
                valor={condicionPago}
                onChange={setCondicionPago}
              />
              <Selector
                label="Lista de precio"
                opciones={opciones.niveles}
                valor={nivelPrecio}
                onChange={setNivelPrecio}
              />
              <Selector
                label="Subtipo de factura"
                opciones={opciones.subtipos}
                valor={subtipo}
                onChange={setSubtipo}
              />
              <Selector
                label="Actividad comercial"
                opciones={opciones.actividades}
                valor={actividadComercial}
                onChange={setActividadComercial}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Tipo de documento</Text>
              <View style={styles.segment}>
                {TIPOS_DOCUMENTO.map((tipo) => {
                  const activo = tipo === tipoDocumento;
                  return (
                    <Pressable
                      key={tipo}
                      onPress={() => setTipoDocumento(tipo)}
                      style={[styles.segmentItem, activo && styles.segmentActive]}
                    >
                      <Text style={[styles.segmentText, activo && styles.segmentTextActive]}>{tipo}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Checkbox label="Sugerido venta" checked={sugeridoVenta} onChange={setSugeridoVenta} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <Pressable
          onPress={continuar}
          disabled={!opciones}
          style={({ pressed }) => [styles.action, (pressed || !opciones) && styles.pressed]}
        >
          <Feather name="check" size={22} color={colors.onPrimary} />
          <Text style={styles.actionText}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  clientIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientTexts: { flex: 1 },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  loading: { marginTop: spacing.lg },
  warning: { fontSize: 13, color: colors.warning },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  label: { fontSize: 12, color: colors.textMuted },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: ACCENT },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.onPrimary },
  bar: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
