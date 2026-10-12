import { File, Paths } from 'expo-file-system';

import { generateSalt, hashPassword, verifyPassword } from './security';
import { normalizeEmail, normalizeHandheld, normalizeHost } from '../utils/validators';

// Archivo JSON con la configuración del primer uso (conexión + primer usuario).
// Vive en el directorio de documentos de la app (no lo borra el sistema).
const CONFIG_FILE = 'coagro-config.json';
const CONFIG_VERSION = 1;

function configFile() {
  return new File(Paths.document, CONFIG_FILE);
}

export function configExists() {
  try {
    return configFile().exists;
  } catch {
    return false;
  }
}

// Devuelve la configuración o null si no existe / está corrupta.
export async function readConfig() {
  try {
    const file = configFile();
    if (!file.exists) return null;
    const config = JSON.parse(await file.text());
    if (!config?.user?.email || !config?.user?.passwordHash) return null;
    return config;
  } catch {
    return null;
  }
}

// Crea el JSON con el primer usuario. La contraseña se guarda como sal + hash.
export async function createConfig({ host, handheld, email, password }) {
  const salt = await generateSalt();
  const config = {
    version: CONFIG_VERSION,
    createdAt: new Date().toISOString(),
    connection: {
      host: normalizeHost(host),
      handheld: normalizeHandheld(handheld),
    },
    user: {
      email: normalizeEmail(email),
      salt,
      passwordHash: await hashPassword(password, salt),
    },
  };

  const file = configFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(config, null, 2));
  return config;
}

// Valida credenciales contra el JSON. Devuelve la config si son correctas, o null.
export async function checkCredentials(email, password) {
  const config = await readConfig();
  if (!config) return null;
  if (normalizeEmail(email) !== config.user.email) return null;
  const ok = await verifyPassword(password, config.user.salt, config.user.passwordHash);
  return ok ? config : null;
}

// Útil durante desarrollo para volver al primer uso.
export function deleteConfig() {
  const file = configFile();
  if (file.exists) file.delete();
}
