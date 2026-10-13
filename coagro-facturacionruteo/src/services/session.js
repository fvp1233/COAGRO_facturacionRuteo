// Sesión en memoria: se pierde al cerrar la app (a propósito, no se guarda la contraseña).
// El login local guarda aquí las credenciales escritas para volver a iniciar sesión en la API
// al sincronizar si el token venció. El token vive en SecureStore (tokenStore.js).

let session = { email: null, password: null };

export function setSession(values) {
  session = { ...session, ...values };
}

export function getSession() {
  return session;
}

export function clearSession() {
  session = { email: null, password: null };
}
