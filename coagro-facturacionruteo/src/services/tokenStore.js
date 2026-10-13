import * as SecureStore from 'expo-secure-store';

// Token de la app móvil (JWT del login en línea). Se guarda cifrado con expo-secure-store,
// nunca en el JSON de configuración ni en SQLite.
const TOKEN_KEY = 'coagro_mobile_token';

export async function getToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // no había token
  }
}
