// Configuración de la API. Si una ruta no responde (404), el mensaje de error de la app
// muestra la URL completa que se intentó: ajusta aquí el prefijo o la ruta.

// Las rutas de tu backend cuelgan de "/api/v1" (confirmado:
// http://localhost:5000/api/v1/fr/sync/clientes).
export const API_PREFIX = '/api/v1';

export const PATHS = {
  syncClientes: '/fr/sync/clientes',
  syncArticulos: '/fr/sync/articulos',
};

// Tiempo máximo de espera por petición.
export const TIMEOUT_MS = 15000;
