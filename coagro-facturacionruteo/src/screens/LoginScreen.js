import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AuthLayout from '../components/auth/AuthLayout';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import Checkbox from '../components/ui/Checkbox';
import LinkText from '../components/ui/LinkText';
import { checkCredentials } from '../services/localConfig';
import { setSession } from '../services/session';
import { borrarSesionRecordada, guardarSesionRecordada } from '../services/sesionRecordada';
import { initDatabase } from '../db/database';
import { validateLoginForm } from '../utils/validators';
import { colors, spacing } from '../theme';

// Valida contra el JSON local (funciona sin internet). Si es correcto, guarda las credenciales
// en memoria (para renovar el token al sincronizar), crea/abre la base SQLite (aplica el
// esquema de migrations.js) y deja entrar a la app. Con "Mantener sesión iniciada" la sesión se
// guarda cifrada en el equipo y la próxima vez la app entra sin pedirla (services/sesionRecordada).
export default function LoginScreen({ onLogin, onDevReset }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const found = validateLoginForm({ email: usuario, password });
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      const config = await checkCredentials(usuario, password);
      if (!config) {
        setFormError('Usuario o contraseña incorrectos');
        return;
      }
      setSession({ email: usuario, password });
      await initDatabase();
      // Si no se puede guardar la sesión, igual se entra (solo se pedirá de nuevo la próxima vez).
      try {
        if (recordar) await guardarSesionRecordada({ email: usuario, password });
        else await borrarSesionRecordada();
      } catch {
        // almacén seguro no disponible
      }
      onLogin?.(config);
    } catch {
      setFormError('No se pudo preparar la base de datos local. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      headerTitle="¡Bienvenido!"
      headerSubtitle="Accede al módulo de facturación de ruteo, liquidaciones y despachos veterinarios."
      title="Iniciar Sesión"
      subtitle="Ingresa tus credenciales de facturación o ruta"
      footerText="¿No tienes acceso al sistema?"
      footerLink="Solicitar activación de ruta o usuario"
      onLogoLongPress={onDevReset}
    >
      <TextField
        label="Usuario"
        icon="at"
        placeholder="ej. ruta@coagro.com"
        value={usuario}
        onChangeText={(v) => {
          setUsuario(v);
          setErrors((prev) => ({ ...prev, email: undefined }));
        }}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="Contraseña"
        icon="lock-outline"
        placeholder="••••••••••••"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setErrors((prev) => ({ ...prev, password: undefined }));
        }}
        error={errors.password}
        secure
      />

      <View style={styles.optionsRow}>
        <Checkbox label="Mantener sesión iniciada" checked={recordar} onChange={setRecordar} />
        <LinkText title="¿Olvidaste tu clave?" />
      </View>

      {formError ? <Text style={styles.formError}>{formError}</Text> : null}

      <PrimaryButton
        title="Ingresar al Sistema"
        icon="arrow-forward"
        onPress={handleSubmit}
        loading={loading}
        style={styles.submit}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -spacing.sm,
  },
  formError: {
    fontSize: 13,
    color: colors.error,
    marginTop: spacing.md,
  },
  submit: {
    marginTop: spacing.xl,
  },
});
