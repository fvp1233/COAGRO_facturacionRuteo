import { StyleSheet, Text, View } from 'react-native';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { colors } from '../../theme';

// La sincronización de clientes se movió a Datos > Cargar datos (sincroniza todas las tablas).
export default function SincronizarView({ onBack }) {
  return (
    <View style={styles.root}>
      <CenteredHeader title="Sincronizar" onBack={onBack} />
      <View style={styles.body}>
        <Text style={styles.text}>Próximamente funcionando</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 14, color: colors.textMuted },
});
