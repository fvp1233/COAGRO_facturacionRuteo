// Sesión en memoria: se pierde al cerrar la app (a propósito, no se guarda la contraseña).
// El login local guarda aquí las credenciales escritas para poder iniciar sesión en la API
// al sincronizar; el token de la API se guarda al obtenerlo.

let session = { email: null, password: null, token: null };

export function setSession(values) {
  session = { ...session, ...values };
}

export function getSession() {
  return session;
}

export function clearSession() {
  session = { email: null, password: null, token: null };
}
