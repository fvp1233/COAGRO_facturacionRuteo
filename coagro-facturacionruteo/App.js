import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConnectionScreen from './src/screens/ConnectionScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ModulePlaceholderScreen from './src/screens/ModulePlaceholderScreen';
import ClientesScreen from './src/screens/clientes/ClientesScreen';
import DatosScreen from './src/screens/DatosScreen';
import ReportesScreen from './src/screens/ReportesScreen';
import { configExists, deleteConfig } from './src/services/localConfig';
import { databaseExists, resetDatabase } from './src/db/database';
import { colors } from './src/theme';

// Navegación temporal de prueba: se reemplazará por un navegador real (Expo Router).
//
// Flujo de arranque:
//   sin configuración ni base  -> 'connection' (primer uso) -> 'login' -> 'home'
//   con configuración o base   -> 'login' -> 'home'
export default function App() {
  const [screen, setScreen] = useState('loading');
  const [activeModule, setActiveModule] = useState(null);

  useEffect(() => {
    // Si ya hay JSON o base SQLite en el dispositivo, no es primer uso.
    const firstUse = !configExists() && !databaseExists();
    setScreen(firstUse ? 'connection' : 'login');
  }, []);

  // SOLO DESARROLLO: mantener presionado el logo ~1.5 s borra el JSON y la base local
  // y vuelve a la pantalla de Conexión (primer uso). No existe en la versión final.
  const handleDevReset = () => {
    Alert.alert(
      'Reiniciar datos locales',
      'Se borrarán la configuración (JSON) y la base SQLite de este dispositivo. Solo para desarrollo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: async () => {
            await resetDatabase();
            deleteConfig();
            setScreen('connection');
          },
        },
      ],
    );
  };
  const devReset = __DEV__ ? handleDevReset : undefined;

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.headerBg }}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        );
      case 'connection':
        return <ConnectionScreen onConnect={() => setScreen('login')} onDevReset={devReset} />;
      case 'login':
        return <LoginScreen onLogin={() => setScreen('home')} onDevReset={devReset} />;
      case 'module':
        if (activeModule.id === 'clientes') {
          return <ClientesScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'reportes') {
          return <ReportesScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'datos') {
          return <DatosScreen module={activeModule} onBack={() => setScreen('home')} />;
        }
        return <ModulePlaceholderScreen module={activeModule} onBack={() => setScreen('home')} />;
      default:
        return (
          <HomeScreen
            onOpenModule={(module) => {
              setActiveModule(module);
              setScreen('module');
            }}
            onLogout={() => setScreen('login')}
          />
        );
    }
  };

  return <SafeAreaProvider>{renderScreen()}</SafeAreaProvider>;
}
