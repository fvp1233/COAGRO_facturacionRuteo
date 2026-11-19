import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const textOr = (v) => (v === null || v === undefined ? '' : String(v).trim());

const completa = (fila, claves) => fila && typeof fila === 'object' && claves.every((k) => textOr(fila[k]) !== '');

// Descarga la división territorial de la reforma (ver migración v34): municipios nuevos y a qué
// municipio pertenece cada distrito (= código de erpadmin.DIVISION_GEOGRAFICA2). Respuesta:
//   { result: { municipios: [{ PAIS, DIVISION_GEOGRAFICA1, MUNICIPIO, NOMBRE }],
//               distritos:  [{ PAIS, DIVISION_GEOGRAFICA1, DIVISION_GEOGRAFICA2, MUNICIPIO }] } }
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga.
export async function descargarMunicipios() {
  const json = await getJson(PATHS.syncMunicipios);
  const data = json?.result;
  if (!data || !Array.isArray(data.municipios) || !Array.isArray(data.distritos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (municipios).');
  }
  const municipios = data.municipios.filter((m) => completa(m, ['PAIS', 'DIVISION_GEOGRAFICA1', 'MUNICIPIO', 'NOMBRE']));
  const distritos = data.distritos.filter((d) =>
    completa(d, ['PAIS', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'MUNICIPIO'])
  );
  const omitidos = data.municipios.length - municipios.length + (data.distritos.length - distritos.length);

  const guardar = async (db) => {
    // Se reemplazan completas con lo que manda el servidor.
    await db.execAsync('DELETE FROM FR_DISTRITO; DELETE FROM FR_MUNICIPIO;');
    const sqlMun = await db.prepareAsync(
      'INSERT OR REPLACE INTO FR_MUNICIPIO (PAIS, DIVISION_GEOGRAFICA1, MUNICIPIO, NOMBRE) VALUES (?, ?, ?, ?)'
    );
    try {
      for (const m of municipios) {
        await sqlMun.executeAsync([textOr(m.PAIS), textOr(m.DIVISION_GEOGRAFICA1), textOr(m.MUNICIPIO), textOr(m.NOMBRE)]);
      }
    } finally {
      await sqlMun.finalizeAsync();
    }
    const sqlDis = await db.prepareAsync(
      'INSERT OR REPLACE INTO FR_DISTRITO (PAIS, DIVISION_GEOGRAFICA1, DIVISION_GEOGRAFICA2, MUNICIPIO) VALUES (?, ?, ?, ?)'
    );
    try {
      for (const d of distritos) {
        await sqlDis.executeAsync([
          textOr(d.PAIS),
          textOr(d.DIVISION_GEOGRAFICA1),
          textOr(d.DIVISION_GEOGRAFICA2),
          textOr(d.MUNICIPIO),
        ]);
      }
    } finally {
      await sqlDis.finalizeAsync();
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_municipios_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { municipios: municipios.length, distritos: distritos.length, omitidos } };
}
