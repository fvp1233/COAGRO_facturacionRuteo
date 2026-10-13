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
import ConsultaDocumentosView from './ConsultaDocumentosView';
import { CONSULTAS } from '../../constants/consultas';
import { registrarVisita } from '../../repositories/visitas';
import { colors } from '../../theme';

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
  // Opción abierta desde las opciones del cliente ('cobros' | 'consultar'); null = menú de opciones.
  const [opcionActiva, setOpcionActiva] = useState(null);
  // Cobro en curso ({ moneda, tipoPago }) tras continuar desde Cobros; abre la tabla de documentos.
  const [cobro, setCobro] = useState(null);
  // Consulta abierta desde el Menú Consultar del cliente (p. ej. 'documentos'); null = menú.
  const [consulta, setConsulta] = useState(null);

  // El botón Validar del menú inferior abre las opciones del cliente seleccionado.
  const handleTab = (key) => {
    if (key === 'validar') {
      if (!seleccion) {
        setActiveTab('validar');
        Alert.alert('Validar', 'Selecciona un cliente de la tabla primero.');
        return;
      }
      // inicio = hora en que se abre el módulo Validar del cliente.
      setValidando({ ...seleccion, inicio: new Date() });
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
            onSelectCliente={(cliente, ruta) => setSeleccion({ cliente, ruta })}
            initialRutaCodigo={seleccion?.ruta ?? null}
            initialSelectedCodigo={seleccion?.cliente.codigo ?? null}
          />
        );
      case 'consulta':
        return <ConsultaView onBack={() => setActiveTab('validar')} />;
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

  // Al salir de Validar se pregunta si se registra la visita.
  const handleSalirValidar = () => {
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

  if (validando && opcionActiva === 'cobros' && cobro) {
    return (
      <CobroDocumentosView
        cliente={validando.cliente}
        ruta={validando.ruta}
        moneda={cobro.moneda}
        tipoPago={cobro.tipoPago}
        onBack={() => setCobro(null)}
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

  if (validando && opcionActiva === 'consultar' && consulta === 'documentos') {
    return (
      <ConsultaDocumentosView
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
          if (opcion.id === 'documentos') setConsulta(opcion.id);
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
          if (opcion.id === 'cobros' || opcion.id === 'consultar') setOpcionActiva(opcion.id);
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
    backgroundColor: '#F4F5FA',
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
    color: colors.textSecondary,
  },
});
