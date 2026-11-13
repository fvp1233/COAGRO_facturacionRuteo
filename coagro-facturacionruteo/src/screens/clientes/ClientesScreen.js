import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import BottomTabBar from '../../components/ui/BottomTabBar';
import CenteredHeader from '../../components/ui/CenteredHeader';
import ValidarView from './ValidarView';
import ConsultaView from './ConsultaView';
import SincronizarView from './SincronizarView';
import ClienteOpcionesView from './ClienteOpcionesView';
import VisitaRegistroView from './VisitaRegistroView';
import CobrosView from './CobrosView';
import CobroDocumentosView from './CobroDocumentosView';
import PagoView from './PagoView';
import ReciboView from './ReciboView';
import ConsultaCobrosView from './ConsultaCobrosView';
import ConsultaPedidosView from './ConsultaPedidosView';
import ConsultaFacturasView from './ConsultaFacturasView';
import ConsultaClienteView from './ConsultaClienteView';
import PedidoView from './PedidoView';
import PedidoArticulosView from './PedidoArticulosView';
import CotizacionesView from './CotizacionesView';
import DescuentosView from './DescuentosView';
import PromocionalesView from './PromocionalesView';
import { CONSULTAS } from '../../constants/consultas';
import { registrarVisita } from '../../repositories/visitas';
import { getUbicacionCliente } from '../../repositories/clientes';
import { getDocumentosCobro } from '../../repositories/cobros';
import { encabezadoPorDefecto, TIPOS_PEDIDO } from '../../repositories/pedidos';
import { formatMonto } from '../../utils/formato';
import { colors } from '../../theme';

// Estado de visita (EFECT_VISITA_RT) con que se registra la visita al guardar un pedido.
const ESTADO_VISITA_EFECTIVA = '01';

const TABS = [
  {
    key: 'validar',
    label: 'Validar',
    icon: { family: 'MaterialCommunityIcons', name: 'clipboard-check-outline' },
    activeIcon: { family: 'Feather', name: 'check' },
  },
  { key: 'despacho', label: 'Despacho', icon: { family: 'Feather', name: 'truck' } },
  { key: 'consulta', label: 'Consulta', icon: { family: 'Feather', name: 'search' } },
  { key: 'sincronizar', label: 'Sincronizar', icon: { family: 'MaterialCommunityIcons', name: 'sync' } },
];

// Contenedor del módulo Clientes: el menú inferior cambia la vista activa.
export default function ClientesScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('validar');
  // Sube cada vez que termina una sincronización para que Validar vuelva a leer la base.
  const [refreshKey, setRefreshKey] = useState(0);
  // Cliente que se está validando ({ cliente, ruta }); abre la página de opciones.
  const [validando, setValidando] = useState(null);
  // Registro de visita en curso ({ cliente, ruta, inicio, fin }), tras confirmar al salir de Validar.
  const [registro, setRegistro] = useState(null);
  // Último cliente seleccionado en la tabla ({ cliente, ruta }).
  const [seleccion, setSeleccion] = useState(null);
  // Opción abierta desde las opciones del cliente ('cobros' | 'pedido' | 'cotizacion' | 'descuentos' | 'consultar'); null = menú.
  const [opcionActiva, setOpcionActiva] = useState(null);
  // Cobro en curso ({ moneda, tipoPago }) tras continuar desde Cobros; abre la tabla de documentos.
  const [cobro, setCobro] = useState(null);
  // Pago en curso ({ documento, saldoTotal, saldoDocumento, totalAPagar }) tras tocar Pagar en un documento.
  const [pago, setPago] = useState(null);
  // Recibo abierto (ID de COBRO_PAGO) tras guardar un pago o desde los abonos anteriores.
  const [reciboVer, setReciboVer] = useState(null);
  // Filtro de Documentos a cobrar ('pendientes' | 'abonos'); se conserva al volver de un recibo.
  const [filtroCobro, setFiltroCobro] = useState('pendientes');
  // Encabezado del pedido (o cotización) en curso tras continuar desde Pedido; abre la tabla de artículos.
  const [pedido, setPedido] = useState(null);
  // En Cotización: true = captura de una nueva; false = lista de cotizaciones del cliente.
  const [nuevaCotizacion, setNuevaCotizacion] = useState(false);
  // Atajo desde Descuentos y promociones: artículo con el que se abrió el pedido o la cotización
  // ({ codigo, cantMin }), saltando el encabezado. null = flujo normal.
  const [atajoDescuento, setAtajoDescuento] = useState(null);
  // Pestaña abierta en Descuentos y promociones ('descuentos' | 'promociones'), para volver a ella.
  const [tabDescuentos, setTabDescuentos] = useState('descuentos');
  // Consulta abierta desde el Menú Consultar del cliente (p. ej. 'cobros'); null = menú.
  const [consulta, setConsulta] = useState(null);
  // Consulta abierta desde la pestaña Consulta (lupa) sobre el cliente seleccionado en la tabla.
  const [consultaTab, setConsultaTab] = useState(null);

  // Aviso informativo al validar: el cliente tiene documentos pendientes de cobro (no bloquea nada).
  const avisarDocumentosPendientes = ({ cliente, ruta }) => {
    getDocumentosCobro({ cliente: cliente.codigo, ruta })
      .then((docs) => {
        if (!docs.length) return;
        Alert.alert(
          'Documentos pendientes',
          `${cliente.nombre} tiene ${docs.length} ${docs.length === 1 ? 'documento pendiente' : 'documentos pendientes'} de cobro.`
        );
      })
      .catch(() => {});
  };

  // El botón Validar del menú inferior abre las opciones del cliente seleccionado.
  const handleTab = (key) => {
    setConsultaTab(null);
    if (key === 'validar') {
      if (!seleccion) {
        setActiveTab('validar');
        Alert.alert('Validar', 'Selecciona un cliente de la tabla primero.');
        return;
      }
      // inicio = hora en que se abre el módulo Validar del cliente.
      setValidando({ ...seleccion, inicio: new Date() });
      avisarDocumentosPendientes(seleccion);
      return;
    }
    setActiveTab(key);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'validar':
        return (
          <ValidarView
            onBack={onBack}
            refreshKey={refreshKey}
            onSelectCliente={(cliente, ruta) => setSeleccion(cliente ? { cliente, ruta } : null)}
            initialRutaCodigo={seleccion?.ruta ?? null}
            initialSelectedCodigo={seleccion?.cliente.codigo ?? null}
          />
        );
      case 'consulta':
        return (
          <ConsultaView
            onBack={() => setActiveTab('validar')}
            onOpenConsulta={(opcion) => {
              if (opcion.id !== 'cliente' && opcion.id !== 'cobros') {
                Alert.alert(opcion.title, 'Próximamente.');
              } else if (!seleccion) {
                Alert.alert(opcion.title, 'Selecciona un cliente de la tabla primero.');
              } else {
                setConsultaTab(opcion.id);
              }
            }}
          />
        );
      case 'sincronizar':
        return (
          <SincronizarView
            onBack={() => setActiveTab('validar')}
            onSynced={() => setRefreshKey((k) => k + 1)}
          />
        );
      default: {
        const tab = TABS.find((t) => t.key === activeTab);
        return (
          <View style={styles.placeholder}>
            <CenteredHeader title={tab.label} onBack={() => setActiveTab('validar')} />
            <View style={styles.placeholderBody}>
              <Text style={styles.placeholderText}>Interfaz en construcción</Text>
            </View>
          </View>
        );
      }
    }
  };

  // Al guardar un pedido (o cotización) la visita se registra sola como "Visita Efectiva" (tipo Real),
  // con el inicio de Validar, y se vuelve al menú del cliente. Al salir de Validar ya no se pregunta.
  const handlePedidoGuardado = async (numero) => {
    const tipo = TIPOS_PEDIDO[opcionActiva];
    setAtajoDescuento(null);
    setPedido(null);
    setNuevaCotizacion(false);
    setOpcionActiva(null);
    await registrarVisitaEfectiva(`${tipo.titulo} ${numero}`);
  };

  // Atajo desde Descuentos y promociones: arma el encabezado con los valores del cliente (sin pasar por
  // PedidoView) y abre la captura de artículos con el artículo del descuento ya seleccionado.
  // tipoKey: 'pedido' | 'cotizacion'. Si al cliente le faltan datos del encabezado, se avisa y se abre
  // el encabezado normal para completarlos (el artículo queda guardado y se selecciona igual).
  const hacerDesdeDescuento = async (tipoKey, descuento) => {
    let encabezado = null;
    let error = null;
    try {
      encabezado = await encabezadoPorDefecto(validando.cliente.codigo, validando.ruta);
    } catch (e) {
      error = e;
    }
    setAtajoDescuento({ codigo: descuento.articulo, cantMin: descuento.cantMin });
    setNuevaCotizacion(tipoKey === 'cotizacion');
    setPedido(encabezado);
    setOpcionActiva(tipoKey);
    if (error) {
      Alert.alert(
        `Datos ${TIPOS_PEDIDO[tipoKey].del}`,
        `${error?.message || 'No se pudo armar el encabezado.'} Completa el encabezado para continuar.`
      );
    }
  };

  // Al salir de la captura abierta con el atajo se vuelve a Descuentos y promociones.
  const volverADescuentos = () => {
    setAtajoDescuento(null);
    setPedido(null);
    setNuevaCotizacion(false);
    setOpcionActiva('descuentos');
  };

  // Registra la visita efectiva de la validación en curso (una sola vez por visita).
  const registrarVisitaEfectiva = async (notas) => {
    if (validando.visitaRegistrada) return; // otro documento en la misma visita: ya quedó registrada
    try {
      // Ubicación de la visita: las coordenadas del cliente (Validar > Ubicación > Asignar coordenadas).
      const ubicacion = await getUbicacionCliente(validando.ruta, validando.cliente.codigo);
      await registrarVisita({
        cliente: validando.cliente.codigo,
        ruta: validando.ruta,
        inicio: validando.inicio,
        fin: new Date(),
        tipo: 'R',
        razon: ESTADO_VISITA_EFECTIVA,
        notas,
        ubicacion,
      });
      setValidando((v) => (v ? { ...v, visitaRegistrada: true } : v));
      setRefreshKey((k) => k + 1); // la tabla marca al cliente como visitado
    } catch (e) {
      Alert.alert('No se pudo registrar la visita', e?.message || 'Error al insertar en la base local.');
    }
  };

  // Al salir de Validar se pregunta si se registra la visita (salvo que ya se registró con un pedido).
  const handleSalirValidar = () => {
    if (validando?.visitaRegistrada) {
      setOpcionActiva(null);
      setValidando(null);
      return;
    }
    Alert.alert('Registro de visita', '¿Desea registrar la visita del cliente?', [
      {
        text: 'No',
        style: 'cancel',
        onPress: () => {
          setOpcionActiva(null);
          setValidando(null);
        },
      },
      {
        text: 'Sí',
        onPress: () => {
          setOpcionActiva(null);
          setRegistro({ ...validando, fin: new Date() });
        },
      },
    ]);
  };

  // Inserta la visita en VISITA y VISITA_UBICACION (SQLite local; se subirá al servidor después).
  // `visita`: cliente, ruta, inicio, fin, tipo ('R'|'T'), razon (EFECT_VISITA), notas, ubicacion.
  const handleGuardarVisita = async (visita) => {
    try {
      await registrarVisita(visita);
    } catch (e) {
      Alert.alert('No se pudo guardar la visita', e?.message || 'Error al insertar en la base local.');
      return;
    }
    setRegistro(null);
    setValidando(null);
    setRefreshKey((k) => k + 1); // la tabla vuelve a leer para marcar al cliente como visitado
    Alert.alert('Visita registrada', 'La visita se guardó correctamente.');
  };

  if (registro) {
    return (
      <VisitaRegistroView
        cliente={registro.cliente}
        ruta={registro.ruta}
        inicio={registro.inicio}
        fin={registro.fin}
        onBack={() => {
          setRegistro(null);
          setValidando(null);
        }}
        onGuardar={handleGuardarVisita}
      />
    );
  }

  // Recibo de un pago: recién guardado (vuelve a la lista de documentos) o de un abono anterior
  // abierto desde la pantalla de pago (vuelve a ella).
  if (validando && opcionActiva === 'cobros' && cobro && reciboVer) {
    return <ReciboView idPago={reciboVer} onBack={() => setReciboVer(null)} />;
  }

  if (validando && opcionActiva === 'cobros' && cobro && pago) {
    return (
      <PagoView
        cliente={validando.cliente}
        ruta={validando.ruta}
        documento={pago.documento}
        moneda={cobro.moneda}
        saldoTotal={pago.saldoTotal}
        saldoDocumento={pago.saldoDocumento}
        totalAPagar={pago.totalAPagar}
        onBack={() => setPago(null)}
        onVerRecibo={setReciboVer}
        onPagado={({ idPago, recibo, pagado, saldoPendiente }) => {
          // El pago ya quedó en COBRO_PAGO; al volver, la lista de documentos lo descuenta del saldo.
          const numero = pago.documento.documento;
          setPago(null);
          setReciboVer(idPago);
          Alert.alert(
            `Recibo ${recibo}`,
            saldoPendiente > 0
              ? `Se abonaron ${formatMonto(pagado)} al documento ${numero}. Quedan pendientes ${formatMonto(saldoPendiente)}.`
              : `El documento ${numero} quedó pagado por completo (${formatMonto(pagado)}).`
          );
        }}
      />
    );
  }

  if (validando && opcionActiva === 'cobros' && cobro) {
    return (
      <CobroDocumentosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        moneda={cobro.moneda}
        tipoPago={cobro.tipoPago}
        onBack={() => {
          setCobro(null);
          setFiltroCobro('pendientes');
        }}
        onPagar={(documento, totales) => setPago({ documento, ...totales })}
        onVerRecibo={setReciboVer}
        filtro={filtroCobro}
        onFiltroChange={setFiltroCobro}
      />
    );
  }

  if (validando && opcionActiva === 'cobros') {
    return (
      <CobrosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={() => setOpcionActiva(null)}
        onContinuar={setCobro}
      />
    );
  }

  // Pedido y Cotización usan las mismas pantallas de captura; solo cambia el tipo (TIP_DOC 'F' o 'C').
  // Cotización abre primero la lista del cliente (aprobar o crear una nueva).
  if (validando && TIPOS_PEDIDO[opcionActiva] && pedido) {
    return (
      <PedidoArticulosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        encabezado={pedido}
        tipo={TIPOS_PEDIDO[opcionActiva]}
        articuloInicial={atajoDescuento}
        onBack={() => (atajoDescuento ? volverADescuentos() : setPedido(null))}
        onGuardado={handlePedidoGuardado}
      />
    );
  }

  if (validando && opcionActiva === 'cotizacion' && !nuevaCotizacion) {
    return (
      <CotizacionesView
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={() => setOpcionActiva(null)}
        onNueva={() => setNuevaCotizacion(true)}
        onAprobada={(numero) => registrarVisitaEfectiva(`Pedido ${numero} (cotización aprobada)`)}
      />
    );
  }

  if (validando && TIPOS_PEDIDO[opcionActiva]) {
    return (
      <PedidoView
        cliente={validando.cliente}
        ruta={validando.ruta}
        tipo={TIPOS_PEDIDO[opcionActiva]}
        onBack={() =>
          atajoDescuento
            ? volverADescuentos()
            : opcionActiva === 'cotizacion'
              ? setNuevaCotizacion(false)
              : setOpcionActiva(null)
        }
        onContinuar={setPedido}
      />
    );
  }

  if (validando && opcionActiva === 'promocionales') {
    return (
      <PromocionalesView cliente={validando.cliente} ruta={validando.ruta} onBack={() => setOpcionActiva(null)} />
    );
  }

  if (validando && opcionActiva === 'descuentos') {
    return (
      <DescuentosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={() => setOpcionActiva(null)}
        onHacerDocumento={hacerDesdeDescuento}
        tab={tabDescuentos}
        onTabChange={setTabDescuentos}
      />
    );
  }

  if (validando && opcionActiva === 'consultar' && consulta === 'cliente') {
    return (
      <ConsultaClienteView cliente={validando.cliente} ruta={validando.ruta} onBack={() => setConsulta(null)} />
    );
  }

  if (!validando && activeTab === 'consulta' && consultaTab === 'cliente' && seleccion) {
    return (
      <ConsultaClienteView cliente={seleccion.cliente} ruta={seleccion.ruta} onBack={() => setConsultaTab(null)} />
    );
  }

  if (!validando && activeTab === 'consulta' && consultaTab === 'cobros' && seleccion) {
    return (
      <ConsultaCobrosView cliente={seleccion.cliente} ruta={seleccion.ruta} onBack={() => setConsultaTab(null)} />
    );
  }

  if (validando && opcionActiva === 'consultar' && consulta === 'pedidos') {
    return (
      <ConsultaPedidosView cliente={validando.cliente} ruta={validando.ruta} onBack={() => setConsulta(null)} />
    );
  }

  if (validando && opcionActiva === 'consultar' && consulta === 'documentos') {
    return (
      <ConsultaFacturasView cliente={validando.cliente} ruta={validando.ruta} onBack={() => setConsulta(null)} />
    );
  }

  if (validando && opcionActiva === 'consultar' && consulta === 'cobros') {
    return (
      <ConsultaCobrosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={() => setConsulta(null)}
      />
    );
  }

  if (validando && opcionActiva === 'consultar') {
    return (
      <ClienteOpcionesView
        title="Menú Consultar"
        opciones={CONSULTAS}
        columns={3}
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={() => setOpcionActiva(null)}
        onOpcion={(opcion) => {
          if (['cobros', 'cliente', 'pedidos', 'documentos'].includes(opcion.id)) setConsulta(opcion.id);
          else Alert.alert(opcion.title, 'Próximamente.');
        }}
      />
    );
  }

  if (validando) {
    return (
      <ClienteOpcionesView
        cliente={validando.cliente}
        ruta={validando.ruta}
        onBack={handleSalirValidar}
        onOpcion={(opcion) => {
          if (['cobros', 'pedido', 'cotizacion', 'descuentos', 'promocionales', 'consultar'].includes(opcion.id)) {
            setNuevaCotizacion(false);
            setAtajoDescuento(null);
            setTabDescuentos('descuentos');
            setOpcionActiva(opcion.id);
          }
          else Alert.alert(opcion.title, 'Próximamente.');
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {renderTab()}
      <BottomTabBar items={TABS} activeKey={activeTab} onChange={handleTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  placeholder: {
    flex: 1,
  },
  placeholderBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
