import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const textOr = (v) => (v === null || v === undefined ? '' : String(v).trim());

const completa = (fila, claves) => fila && typeof fila === 'object' && claves.every((k) => textOr(fila[k]) !== '');

// Catálogos nativos de Softland (país 'ESA'), ver migración v38. Cada lista REEMPLAZA su tabla.
//   departamentos -> DIVISION_GEOGRAFICA1, municipios -> DIVISION_GEOGRAFICA2, distritos -> DIVISION_GEOGRAFICA3.
const LISTAS = [
  {
    arreglo: 'departamentos',
    tabla: 'DIVISION_GEOGRAFICA1',
    columnas: ['PAIS', 'DIVISION_GEOGRAFICA1', 'NOMBRE'],
  },
  {
    arreglo: 'municipios',
    tabla: 'DIVISION_GEOGRAFICA2',
    columnas: ['PAIS', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'NOMBRE'],
  },
  {
    arreglo: 'distritos',
    tabla: 'DIVISION_GEOGRAFICA3',
    columnas: ['PAIS', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'DIVISION_GEOGRAFICA3', 'NOMBRE'],
  },
];

// Descarga la división territorial: GET /fr/sync/municipios responde
//   { result: { departamentos: [{ PAIS, DIVISION_GEOGRAFICA1, NOMBRE }],
//               municipios:    [{ PAIS, DIVISION_GEOGRAFICA1, DIVISION_GEOGRAFICA2, NOMBRE }],
//               distritos:     [{ PAIS, DIVISION_GEOGRAFICA1, DIVISION_GEOGRAFICA2, DIVISION_GEOGRAFICA3, NOMBRE }] } }
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga.
export async function descargarMunicipios() {
  const json = await getJson(PATHS.syncMunicipios);
  const data = json?.result;
  if (!data || LISTAS.some((l) => !Array.isArray(data[l.arreglo]))) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (departamentos, municipios y distritos).');
  }
  const filas = Object.fromEntries(
    LISTAS.map((l) => [l.arreglo, data[l.arreglo].filter((f) => completa(f, l.columnas))])
  );
  const omitidos = LISTAS.reduce((n, l) => n + data[l.arreglo].length - filas[l.arreglo].length, 0);

  const guardar = async (db) => {
    for (const l of LISTAS) {
      await db.runAsync(`DELETE FROM ${l.tabla}`);
      const sql = await db.prepareAsync(
        `INSERT OR REPLACE INTO ${l.tabla} (${l.columnas.join(', ')}) VALUES (${l.columnas.map(() => '?').join(', ')})`
      );
      try {
        for (const f of filas[l.arreglo]) await sql.executeAsync(l.columnas.map((c) => textOr(f[c])));
      } finally {
        await sql.finalizeAsync();
      }
    }
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_municipios_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return {
    guardar,
    resumen: {
      departamentos: filas.departamentos.length,
      municipios: filas.municipios.length,
      distritos: filas.distritos.length,
      omitidos,
    },
  };
}
