import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import AuthLayout from '../components/auth/AuthLayout';
import TextField from '../components/ui/TextField';
import PrimaryButton from '../components/ui/PrimaryButton';
import LinkText from '../components/ui/LinkText';
import FirmaEquipo from '../components/ui/FirmaEquipo';
import { esErrorVinculada } from '../services/deviceFirma';
import { createConfig } from '../services/localConfig';
import { loginEnLinea, registrarUsuario } from '../services/mobileAuth';
import { hostProtocol, MAX_HANDHELD_LENGTH, normalizeHost, validateConnectionForm } from '../utils/validators';
import { colors, spacing } from '../theme';

// Pantalla de primer uso: se muestra solo si el dispositivo aún no tiene configuración.
// - "Ya tengo cuenta": login en línea (/fr/mobile/login). Solo si el servidor lo acepta se crea
//   el JSON local (para el login offline) y se guarda el token; luego se pasa al login.
// - "Registrarme": crea el usuario en el servidor (/fr/mobile/registro); queda pendiente hasta
//   que un Admin lo apruebe en la web. No crea el JSON.
export default function ConnectionScreen({ onConnect, onDevReset }) {
  const [registro, setRegistro] = useState(false);
  const [host, setHost] = useState('');
  const [handheld, setHandheld] = useState('');
  const [nombres, setNombres] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [aviso, setAviso] = useState('');
  // La handheld ya está ligada a otro equipo: se muestra la firma de este para soporte.
  const [vinculada, setVinculada] = useState(false);

  const clearError = (field) => setErrors((prev) => ({ ...prev, [field]: undefined }));

  const cambiarModo = () => {
    setRegistro((v) => !v);
    setErrors({});
    setSaveError('');
    setAviso('');
    setVinculada(false);
  };

  const handleSubmit = async () => {
    const found = validateConnectionForm({ host, handheld, email, password, nombres, registro });
    setErrors(found);
    setSaveError('');
    setAviso('');
    setVinculada(false);
    if (Object.keys(found).length > 0) return;

    const connection = { host: normalizeHost(host), protocol: hostProtocol(host) };
    setSaving(true);
    try {
      if (registro) {
        await registrarUsuario(connection, { email, nombres, password, handheld });
        setRegistro(false);
        setAviso('Tu cuenta quedó pendiente de aprobación. Cuando un administrador la apruebe, inicia sesión con "Ya tengo cuenta".');
        return;
      }
      await loginEnLinea({ email, password, handheld }, connection);
    } catch (e) {
      // El equipo queda sin configurar (no se crea el JSON).
      setSaveError(e?.message || 'No se pudo conectar con el servidor.');
      setVinculada(esErrorVinculada(e));
      return;
    } finally {
      setSaving(false);
    }

    try {
      await createConfig({ host, handheld, email, password });
      onConnect();
    } catch {
      setSaveError('No se pudo guardar la configuración en el dispositivo. Intenta de nuevo.');
    }
  };

  return (
    <AuthLayout
      headerTitle="¡Bienvenido!"
      headerSubtitle="Configura la conexión de tu equipo para el sistema de facturación de ruteo y despachos."
      logoFramed
      title={registro ? 'Registrarme' : 'Conectar Terminal'}
      subtitle={registro ? 'Un administrador debe aprobar tu cuenta' : 'Inicia sesión con tu cuenta aprobada'}
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
        label="Handheld (código del dispositivo)"
        icon="cellphone"
        placeholder="ej. HH1"
        value={handheld}
        onChangeText={(v) => {
          setHandheld(v);
          clearError('handheld');
        }}
        error={errors.handheld}
        maxLength={MAX_HANDHELD_LENGTH}
        autoCapitalize="characters"
        autoCorrect={false}
      />

      {registro ? (
        <TextField
          label="Nombre completo"
          icon="account-outline"
          placeholder="ej. Juan Pérez"
          value={nombres}
          onChangeText={(v) => {
            setNombres(v);
            clearError('nombres');
          }}
          error={errors.nombres}
          autoCapitalize="words"
        />
      ) : null}

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

      {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}
      {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
      {vinculada ? (
        <FirmaEquipo label="Firma de este equipo (compártela con soporte)" style={styles.firma} />
      ) : null}

      <PrimaryButton
        title={registro ? 'Enviar registro' : 'Conectar al Sistema'}
        icon={registro ? 'person-add' : 'arrow-forward'}
        onPress={handleSubmit}
        loading={saving}
        style={styles.submit}
      />

      <LinkText
        title={registro ? 'Ya tengo cuenta' : '¿No tienes cuenta? Registrarme'}
        onPress={saving ? undefined : cambiarModo}
        style={styles.modo}
      />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submit: {
    marginTop: spacing.md,
  },
  modo: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  aviso: {
    fontSize: 13,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  firma: {
    marginBottom: spacing.sm,
  },
  saveError: {
    fontSize: 13,
    color: colors.error,
    marginBottom: spacing.sm,
  },
});
