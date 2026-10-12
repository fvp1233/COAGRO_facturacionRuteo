// Validaciones y normalización de los campos de la configuración inicial.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// host o IPv4, con puerto opcional. Ej: 192.168.1.150:8080, api.coagro.com
const HOST_REGEX = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)(?::\d{1,5})?$/i;

export const MIN_PASSWORD_LENGTH = 6;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function normalizeHandheld(value) {
  return String(value ?? '').trim().toUpperCase();
}

// Quita el protocolo y las barras finales: "http://10.0.0.5:8080/" -> "10.0.0.5:8080"
export function normalizeHost(value) {
  return String(value ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function isValidIpv4IfIpLike(host) {
  const hostname = host.split(':')[0];
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true; // no es IP, se valida como dominio
  return hostname.split('.').every((part) => Number(part) <= 255);
}

function isValidPort(host) {
  const port = host.split(':')[1];
  if (port === undefined) return true;
  const n = Number(port);
  return n >= 1 && n <= 65535;
}

export function validateConnectionForm({ host, handheld, email, password }) {
  const errors = {};

  const h = normalizeHost(host);
  if (!h) errors.host = 'La dirección IP es obligatoria';
  else if (!HOST_REGEX.test(h) || !isValidIpv4IfIpLike(h) || !isValidPort(h)) {
    errors.host = 'Dirección no válida (ej. 192.168.1.150:8080)';
  }

  if (!normalizeHandheld(handheld)) errors.handheld = 'El nombre de la handheld es obligatorio';

  const e = normalizeEmail(email);
  if (!e) errors.email = 'El correo es obligatorio';
  else if (!EMAIL_REGEX.test(e)) errors.email = 'Correo no válido';

  if (!password) errors.password = 'La contraseña es obligatoria';
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`;
  }

  return errors;
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  if (!normalizeEmail(email)) errors.email = 'El correo es obligatorio';
  if (!password) errors.password = 'La contraseña es obligatoria';
  return errors;
}
