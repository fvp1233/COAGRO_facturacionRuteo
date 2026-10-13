// Configuración de la API. Si una ruta no responde (404), el mensaje de error de la app
// muestra la URL completa que se intentó: ajusta aquí el prefijo o la ruta.

// Las rutas de tu backend cuelgan de "/api/v1" (confirmado:
// http://localhost:5000/api/v1/fr/sync/clientes).
export const API_PREFIX = '/api/v1';

// /fr/mobile/registro y /fr/mobile/login no llevan token; el resto exige el token de la app
// (Authorization: Bearer) y rol RUTA. Las rutas de la sync salen del token (no se manda ?ruta=).
export const PATHS = {
  registro: '/fr/mobile/registro',
  login: '/fr/mobile/login',
  sesion: '/fr/mobile/sesion',
  // PDF de un DTE generado por el backend: /fr/mobile/dte/<numero>/pdf
  dtePdf: (numero) => `/fr/mobile/dte/${encodeURIComponent(numero)}/pdf`,
  syncClientes: '/fr/sync/clientes',
  syncArticulos: '/fr/sync/articulos',
  syncCobros: '/fr/sync/cobros',
};

// Tiempo máximo de espera por petición.
export const TIMEOUT_MS = 15000;
