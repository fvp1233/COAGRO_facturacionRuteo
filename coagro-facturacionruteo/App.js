import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ConnectionScreen from './src/screens/ConnectionScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ModulePlaceholderScreen from './src/screens/ModulePlaceholderScreen';
import ClientesScreen from './src/screens/clientes/ClientesScreen';
import DatosScreen from './src/screens/DatosScreen';
import ReportesScreen from './src/screens/ReportesScreen';
import ParametrosScreen from './src/screens/ParametrosScreen';
import CalendarioScreen from './src/screens/CalendarioScreen';
import MetasScreen from './src/screens/MetasScreen';
import { configExists } from './src/services/localConfig';
import { clearSession } from './src/services/session';
import { databaseExists } from './src/db/database';
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

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <ActivityIndicator color={colors.onPrimary} />
          </View>
        );
      case 'connection':
        return <ConnectionScreen onConnect={() => setScreen('login')} />;
      case 'login':
        return <LoginScreen onLogin={() => setScreen('home')} />;
      case 'module':
        if (activeModule.id === 'clientes') {
          return <ClientesScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'reportes') {
          return <ReportesScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'parametros') {
          return <ParametrosScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'calendario') {
          return <CalendarioScreen onBack={() => setScreen('home')} />;
        }
        if (activeModule.id === 'presupuesto') {
          return <MetasScreen onBack={() => setScreen('home')} />;
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
            onLogout={() => {
              clearSession();
              setScreen('login');
            }}
          />
        );
    }
  };

  return <SafeAreaProvider>{renderScreen()}</SafeAreaProvider>;
}
