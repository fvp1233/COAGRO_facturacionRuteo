import * as SecureStore from 'expo-secure-store';

// "Mantener sesión iniciada": como una cookie de sesión en la web. Al iniciar sesión con la casilla
// marcada se guardan usuario y contraseña CIFRADOS con expo-secure-store (Keystore en Android,
// Keychain en iOS; nunca en el JSON ni en SQLite) con un vencimiento. Al abrir la app, si la sesión
// sigue vigente, se entra directo sin escribir nada.
// - La contraseña hace falta para renovar el token del servidor cuando vence (api.reautenticar).
// - El vencimiento se corre cada vez que la app entra con la sesión guardada (vencimiento por
//   inactividad): solo se vuelve a pedir el usuario si la app pasa DIAS_SESION días sin abrirse.
// - "Cerrar sesión" la borra.
const KEY = 'coagro_sesion_recordada';
export const DIAS_SESION = 30;
const MS_DIA = 24 * 60 * 60 * 1000;

const vencimiento = () => new Date(Date.now() + DIAS_SESION * MS_DIA).toISOString();

// Guarda la sesión con un vencimiento nuevo.
export async function guardarSesionRecordada({ email, password }) {
  await SecureStore.setItemAsync(KEY, JSON.stringify({ email, password, vence: vencimiento() }));
}

// Sesión guardada y vigente ({ email, password }) o null (no hay, venció o está dañada). Si venció
// se borra.
export async function leerSesionRecordada() {
  try {
    const texto = await SecureStore.getItemAsync(KEY);
    if (!texto) return null;
    const s = JSON.parse(texto);
    if (!s?.email || !s?.password || !s?.vence || new Date(s.vence).getTime() < Date.now()) {
      await borrarSesionRecordada();
      return null;
    }
    return { email: s.email, password: s.password };
  } catch {
    return null;
  }
}

export async function borrarSesionRecordada() {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // no había sesión guardada
  }
}
