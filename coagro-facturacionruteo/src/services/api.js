import { getDeviceFirma } from './deviceFirma';
import { readConfig } from './localConfig';
import { getSession } from './session';
import { getToken, saveToken } from './tokenStore';
import { API_PREFIX, BASE_URL, PATHS, TIMEOUT_MS } from '../config/api';
import { normalizeEmail } from '../utils/validators';

// code:
//  - 'AUTH': el servidor no acepta el token (401, o rol que ya no es RUTA), ni siquiera tras
//    volver a iniciar sesión en línea.
//  - 'RED': no se pudo llegar al servidor (sin internet, servidor apagado o sin respuesta).
export class ApiError extends Error {
  constructor(message, { status, url, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.code = code;
  }
}

export const isAuthError = (error) => error instanceof ApiError && error.code === 'AUTH';
export const isNetworkError = (error) => error instanceof ApiError && error.code === 'RED';

// Respuesta del middleware de rol del backend cuando el usuario ya no es RUTA.
const SIN_PERMISO = 'No Tiene Permiso';

// "http://10.0.0.5:8080" a partir del host y protocolo guardados (o recibidos antes de tener config).
export function buildBaseUrl({ host, protocol = 'http' }) {
  return `${protocol}://${host}`;
}

// La dirección del servidor sale del JSON guardado en la pantalla de Conexión.
async function baseUrl() {
  const config = await readConfig();
  if (!config?.connection?.host) {
    throw new ApiError('No hay configuración de conexión guardada en este equipo.');
  }
  return buildBaseUrl(config.connection);
}

// Mensajes de error de tu API: { success:false, errors:[...] } (llegan con HTTP 200).
function messageFromBody(body) {
  const errors = body?.errors ?? body?.Errors;
  if (Array.isArray(errors) && errors.length) return errors.join(' ');
  if (typeof errors === 'string' && errors) return errors;
  return 'El servidor rechazó la solicitud.';
}

// Petición a tu API ({ result, success, errors }). Lanza ApiError con un mensaje claro
// (y la URL intentada) si algo falla.
// - base: URL del servidor; si no se pasa, sale de la configuración guardada.
// - auth: manda el token de la app (Authorization: Bearer) si hay uno guardado.
// - archivo: la respuesta es un archivo (p. ej. PDF): devuelve sus bytes (Uint8Array). Si el
//   servidor responde JSON es un error ({ success:false, errors }) y se lanza como tal.
// - timeout: ms de espera (por defecto TIMEOUT_MS).
async function send(method, path, { body, base, auth = true, archivo = false, timeout = TIMEOUT_MS } = {}) {
  const url = `${BASE_URL ?? base ?? (await baseUrl())}${API_PREFIX}${path}`;
  const headers = { Accept: archivo ? '*/*' : 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(`El servidor no respondió a tiempo.\n${url}`, { url, code: 'RED' });
    }
    throw new ApiError(
      `No se pudo conectar con el servidor.\nRevisa que el backend esté encendido y que la conexión (Wi-Fi o adb reverse) esté activa.\n${url}`,
      { url, code: 'RED' }
    );
  } finally {
    clearTimeout(timer);
  }

  const esJson = (response.headers.get('content-type') ?? '').includes('application/json');
  if (archivo && response.ok && !esJson) {
    return new Uint8Array(await response.arrayBuffer());
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    // respuesta sin JSON; se maneja abajo según el código HTTP
  }

  if (response.status === 401) {
    throw new ApiError('Tu sesión en el servidor venció o ya no es válida. Inicia sesión de nuevo.', {
      status: 401,
      url,
      code: 'AUTH',
    });
  }
  if (response.status === 403) {
    throw new ApiError(`El servidor rechazó el acceso a esta ruta (403).\n${url}`, { status: 403, url });
  }
  if (response.status === 404) {
    const detalle = json?.errors?.length ? messageFromBody(json) : 'El servidor no tiene esta ruta (404).';
    throw new ApiError(`${detalle}\n${url}`, { status: 404, url });
  }
  if (!response.ok) {
    throw new ApiError(`Error del servidor (${response.status}).\n${url}`, { status: response.status, url });
  }
  if (!json) {
    throw new ApiError(`El servidor devolvió una respuesta que no es JSON.\n${url}`, { url });
  }
  const errors = json.errors ?? json.Errors;
  if (Array.isArray(errors) && errors[0] === SIN_PERMISO) {
    throw new ApiError('Tu usuario ya no tiene acceso a la app de rutas.', { url, code: 'AUTH' });
  }
  if (json.success === false || json.Success === false) {
    throw new ApiError(messageFromBody(json), { url });
  }
  if (archivo) {
    throw new ApiError(`El servidor no devolvió el archivo esperado.\n${url}`, { url });
  }
  return json;
}

// Toda petición autenticada (auth, por defecto) que el servidor rechace por el token se reintenta
// UNA vez tras iniciar sesión en línea con las credenciales en memoria del login local. Si ese
// login falla (pendiente, desactivado, contraseña cambiada), se lanza su mensaje.
async function request(method, path, options = {}) {
  try {
    return await send(method, path, options);
  } catch (error) {
    if (options.auth === false || !isAuthError(error)) throw error;
  }
  await reautenticar(options.base);
  return send(method, path, options);
}

// Login en línea solo para renovar el token. El login completo, que además guarda usuario y
// rutas, es mobileAuth.loginEnLinea.
async function reautenticar(base) {
  const { email, password } = getSession();
  const config = await readConfig();
  if (!email || !password || !config?.connection?.handheld) {
    throw new ApiError('Tu sesión en el servidor venció. Cierra sesión y vuelve a entrar.', { code: 'AUTH' });
  }
  // La firma liga la handheld a este equipo; sin ella el backend rechaza el login.
  const json = await send('POST', PATHS.login, {
    body: { email: normalizeEmail(email), password, handheld: config.connection.handheld, firma: await getDeviceFirma() },
    base,
    auth: false,
  });
  if (!json?.result?.token) throw new ApiError('El servidor no devolvió un token de sesión.');
  await saveToken(json.result.token);
}

// Descarga un archivo autenticado (GET); devuelve sus bytes.
export function getArchivo(path, options) {
  return request('GET', path, { ...options, archivo: true });
}

export function getJson(path, options) {
  return request('GET', path, options);
}

export function postJson(path, body, options) {
  return request('POST', path, { ...options, body });
}
