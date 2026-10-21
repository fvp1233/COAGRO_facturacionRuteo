import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Firma del equipo: liga la handheld a ESTE dispositivo físico en el backend (registro y login).
// Se calcula una sola vez y se guarda en SecureStore; de ahí en adelante se lee siempre de ahí
// para que no cambie entre versiones de la app. No se usa MAC (Android 6+ e iOS no la entregan)
// ni IP (cambia con cada red). No se borra al reiniciar los datos locales.
const FIRMA_KEY = 'deviceFirma';

let firmaPromise = null;

async function leerIdentificador() {
  try {
    if (Platform.OS === 'android') return Application.getAndroidId();
    if (Platform.OS === 'ios') return await Application.getIosIdForVendorAsync();
  } catch {
    // sin identificador del sistema: se genera uno
  }
  return null;
}

async function calcularFirma() {
  const guardada = await SecureStore.getItemAsync(FIRMA_KEY);
  if (guardada) return guardada;

  const id = String((await leerIdentificador()) ?? '').trim();
  const firma = id || Crypto.randomUUID();
  await SecureStore.setItemAsync(FIRMA_KEY, firma);
  return firma;
}

export function getDeviceFirma() {
  if (!firmaPromise) {
    firmaPromise = calcularFirma().catch((error) => {
      firmaPromise = null; // permite reintentar si SecureStore falló
      throw error;
    });
  }
  return firmaPromise;
}

// Mensaje del backend cuando la handheld ya está ligada a otro equipo.
export function esErrorVinculada(error) {
  return /vinculada a otro dispositivo/i.test(error?.message ?? '');
}
