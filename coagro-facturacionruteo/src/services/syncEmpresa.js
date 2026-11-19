import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

const COLUMNAS = [
  'Empresa_id', 'nombre', 'nombreComercial', 'nit', 'nrc', 'codActividad', 'desActividad', 'complementoDir',
  'telefono', 'correoDte',
];

// Descarga los datos públicos del emisor (dte.dbo.empresa de la empresa del usuario del token) para
// el PDF del pedido / cotización sin conexión. Respuesta:
//   { result: { empresa: { Empresa_id, nombre, nombreComercial, nit, nrc, codActividad, desActividad,
//                          complementoDir, telefono, correoDte } } }
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga.
export async function descargarEmpresa() {
  const json = await getJson(PATHS.syncEmpresa);
  const e = json?.result?.empresa;
  if (!e || typeof e !== 'object' || e.Empresa_id === null || e.Empresa_id === undefined) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (empresa).');
  }
  const fila = { ...e, Empresa_id: Number(e.Empresa_id) };

  const guardar = async (db) => {
    // Una sola fila: se reemplaza con lo que manda el servidor.
    await db.runAsync('DELETE FROM EMPRESA');
    await db.runAsync(
      `INSERT INTO EMPRESA (${COLUMNAS.join(', ')}) VALUES (${COLUMNAS.map(() => '?').join(', ')})`,
      COLUMNAS.map((c) => (c === 'Empresa_id' ? fila.Empresa_id : text(fila[c])))
    );
    await db.runAsync("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_empresa_at', ?)", [
      new Date().toISOString(),
    ]);
  };

  return { guardar, resumen: { empresa: 1, omitidos: 0 } };
}
