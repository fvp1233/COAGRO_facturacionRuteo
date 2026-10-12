import * as Crypto from 'expo-crypto';

// La contraseña nunca se guarda en claro: se guarda sal + hash (SHA-256 iterado).
// Nota: es suficiente para validar acceso offline en el dispositivo. Si más adelante el
// sistema en línea emite tokens, el login contra el servidor reemplaza/complementa esto.
const ITERATIONS = 1000;

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function generateSalt() {
  return bytesToHex(await Crypto.getRandomBytesAsync(16));
}

export async function hashPassword(password, salt) {
  let digest = `${salt}:${password}`;
  for (let i = 0; i < ITERATIONS; i += 1) {
    digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${digest}`);
  }
  return digest;
}

// Comparación sin cortocircuito para no filtrar información por tiempos.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, salt, expectedHash) {
  return safeEqual(await hashPassword(password, salt), expectedHash);
}
