import { readConfig } from './localConfig';
import { API_PREFIX, TIMEOUT_MS } from '../config/api';

export class ApiError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
  }
}

// La dirección del servidor sale del JSON guardado en la pantalla de Conexión.
async function baseUrl() {
  const config = await readConfig();
  if (!config?.connection?.host) {
    throw new ApiError('No hay configuración de conexión guardada en este equipo.');
  }
  return `http://${config.connection.host}`;
}

// Mensajes de error de tu API: { success:false, errors:[...] } (llegan con HTTP 200).
function messageFromBody(body) {
  const errors = body?.errors ?? body?.Errors;
  if (Array.isArray(errors) && errors.length) return errors.join(' ');
  if (typeof errors === 'string' && errors) return errors;
  return 'El servidor rechazó la solicitud.';
}

// GET que devuelve el JSON de tu API ({ result, success, errors }).
// Lanza ApiError con un mensaje claro (y la URL intentada) si algo falla.
export async function getJson(path) {
  const url = `${await baseUrl()}${API_PREFIX}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError(`El servidor no respondió a tiempo.\n${url}`, { url });
    }
    throw new ApiError(
      `No se pudo conectar con el servidor.\nRevisa que el backend esté encendido y que la conexión (Wi-Fi o adb reverse) esté activa.\n${url}`,
      { url }
    );
  } finally {
    clearTimeout(timer);
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    // respuesta sin JSON; se maneja abajo según el código HTTP
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(
      `El servidor pide autenticación para esta ruta (${response.status}).\nRegistra el endpoint sin el middleware de sesión.\n${url}`,
      { status: response.status, url }
    );
  }
  if (response.status === 404) {
    throw new ApiError(`El servidor no tiene esta ruta (404).\n${url}`, { status: 404, url });
  }
  if (!response.ok) {
    throw new ApiError(`Error del servidor (${response.status}).\n${url}`, { status: response.status, url });
  }
  if (!json) {
    throw new ApiError(`El servidor devolvió una respuesta que no es JSON.\n${url}`, { url });
  }
  if (json.success === false || json.Success === false) {
    throw new ApiError(messageFromBody(json), { url });
  }
  return json;
}
