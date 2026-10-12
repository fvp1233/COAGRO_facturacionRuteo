import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/auth/AuthLayout';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import { createConfig } from '../services/localConfig';
import { validateConnectionForm } from '../utils/validators';
import { spacing } from '../theme';

// Pantalla de primer uso: se muestra solo si el dispositivo aún no tiene configuración.
// Todos los campos son obligatorios. Al guardar se crea el JSON y se pasa al login.
export default function ConnectionScreen({ onConnect, onDevReset }) {
  const [host, setHost] = useState('');
  const [handheld, setHandheld] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const clearError = (field) => setErrors((prev) => ({ ...prev, [field]: undefined }));

  const handleSubmit = async () => {
    const found = validateConnectionForm({ host, handheld, email, password });
    setErrors(found);
    setSaveError('');
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      await createConfig({ host, handheld, email, password });
      onConnect();
    } catch {
      setSaveError('No se pudo guardar la configuración en el dispositivo. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout
      headerTitle="¡Bienvenido!"
      headerSubtitle="Configura la conexión de tu equipo para el sistema de facturación de ruteo y despachos."
      logoFramed
      title="Conectar Terminal"
      subtitle="Todos los campos son obligatorios"
      footerText="¿Problemas con la red o el equipo?"
      footerLink="Solicitar asistencia de soporte técnico"
      onLogoLongPress={onDevReset}
    >
      <TextField
        label="Dirección IP"
        icon="web"
        placeholder="ej. 192.168.1.150:8080"
        value={host}
        onChangeText={(v) => {
          setHost(v);
          clearError('host');
        }}
        error={errors.host}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="Handheld (Nombre del dispositivo)"
        icon="cellphone"
        placeholder="ej. HH-VH109-NORTE"
        value={handheld}
        onChangeText={(v) => {
          setHandheld(v);
          clearError('handheld');
        }}
        error={errors.handheld}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      <TextField
        label="Correo del usuario"
        icon="at"
        placeholder="ej. ruta@coagro.com"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          clearError('email');
        }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="Contraseña"
        icon="lock-outline"
        placeholder="Mínimo 6 caracteres"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          clearError('password');
        }}
        error={errors.password}
        secure
      />

      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

      <PrimaryButton
        title="Conectar al Sistema"
        icon="arrow-forward"
        onPress={handleSubmit}
        loading={saving}
        style={styles.submit}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submit: {
    marginTop: spacing.md,
  },
  saveError: {
    fontSize: 13,
    color: '#DC2626',
    marginBottom: spacing.sm,
  },
});
