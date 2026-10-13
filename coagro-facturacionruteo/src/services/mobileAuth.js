import { ApiError, buildBaseUrl, getJson, postJson } from './api';
import { saveToken } from './tokenStore';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';
import { normalizeEmail, normalizeHandheld } from '../utils/validators';

// Registro, login en línea y sesión contra /fr/mobile/*. El token y su renovación automática
// viven en api.js (toda petición en línea va autenticada). El login offline (contra el JSON
// local) sigue en localConfig.checkCredentials.

// Crea el usuario en el servidor; queda pendiente hasta que un Admin lo apruebe en la web.
// `connection`: { host, protocol } (aún no existe la configuración local).
export async function registrarUsuario(connection, { email, nombres, password, handheld }) {
  const json = await postJson(
    PATHS.registro,
    { email: normalizeEmail(email), nombres: nombres.trim(), password, handheld: normalizeHandheld(handheld) },
    { base: buildBaseUrl(connection), auth: false }
  );
  return json.result;
}

// Login en línea: guarda el token (SecureStore) y usuario/handheld/rutas (SQLite, para trabajar
// offline). `connection` solo se pasa en el primer uso; si no, sale de la configuración guardada.
export async function loginEnLinea({ email, password, handheld }, connection) {
  const json = await postJson(
    PATHS.login,
    { email: normalizeEmail(email), password, handheld: normalizeHandheld(handheld) },
    { base: connection ? buildBaseUrl(connection) : undefined, auth: false }
  );
  const result = json?.result;
  if (!result?.token) {
    throw new ApiError('El servidor no devolvió un token de sesión.');
  }
  await saveToken(result.token);
  await guardarDatosSesion(result);
  return result;
}

// Confirma que el token sigue válido y actualiza usuario/handheld/rutas (pueden cambiar en la web).
export async function refrescarSesion() {
  const json = await getJson(PATHS.sesion);
  if (json?.result) await guardarDatosSesion(json.result);
  return json?.result ?? null;
}

// usuario, handheld y rutas del último login/sesión, en app_meta (JSON).
async function guardarDatosSesion({ usuario, handheld, rutas }) {
  const db = await getDatabase();
  await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('mobile_sesion', ?)", [
    JSON.stringify({ usuario, handheld, rutas, actualizado: new Date().toISOString() }),
  ]);
}
