import { getJson, ApiError } from './api';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Descarga rutas, clientes, asignaciones y ubicaciones y las guarda en SQLite en UNA
// transacción: o se guarda todo o no se toca nada (si falla a mitad, los datos anteriores
// siguen intactos). Devuelve un resumen con los conteos.
export async function syncClientes() {
  const json = await getJson(PATHS.syncClientes);
  const data = json?.result;
  if (!data || !Array.isArray(data.clientes) || !Array.isArray(data.rutaOrden)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (clientes / rutaOrden).');
  }
  // Se descartan filas sin sus campos clave (no se guardan códigos vacíos) y se informa cuántas.
  const conClaves = (lista, claves) =>
    (Array.isArray(lista) ? lista : []).filter(
      (fila) => fila && typeof fila === 'object' && claves.every((k) => textOr(fila[k]) !== '')
    );
  const rutas = conClaves(data.rutas, ['RUTA']);
  const clientes = conClaves(data.clientes, ['COD_CLT', 'COD_ZON']);
  const rutaOrden = conClaves(data.rutaOrden, ['RUTA', 'CLIENTE', 'DIA']);
  const ubicaciones = conClaves(data.ubicaciones, ['RUTA', 'CLIENTE']);
  // Estados de visita (EFECT_VISITA_RT). Si el servidor aún no los manda, la tabla local no se toca.
  const traeEfectividades = Array.isArray(data.efectividades);
  const efectividades = conClaves(data.efectividades, ['EFECT_VISITA']);
  // Tipos de cliente (alFAC_TIP_CLT) y niveles de precio (NIVEL_LISTA). Opcionales: si el
  // servidor no los manda, las tablas no se tocan. Los datos comerciales del cliente
  // (CLIENTE_CIA) llegan aparte en /fr/sync/clientesCia (ver syncClientesCia).
  // En pedidos/facturas se guarda NIVEL_PRECIO (el nombre), nunca LST_PRE. El nivel de cada
  // cliente llega en clientes[].nivel_precio; NIVEL_LISTA solo es el catálogo para elegir.
  const traeNiveles = Array.isArray(data.nivelesPrecio);
  const nivelesPrecio = conClaves(data.nivelesPrecio, ['NIVEL_PRECIO', 'LISTA', 'MONEDA']);
  const traeTiposCliente = Array.isArray(data.tiposCliente);
  const tiposCliente = conClaves(data.tiposCliente, ['COD_TIP_CL']);
  const omitidos =
    (Array.isArray(data.rutas) ? data.rutas.length : 0) - rutas.length +
    data.clientes.length - clientes.length +
    data.rutaOrden.length - rutaOrden.length +
    (Array.isArray(data.ubicaciones) ? data.ubicaciones.length : 0) - ubicaciones.length;

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    // Los maestros se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM RUTA_RT');
    await db.runAsync('DELETE FROM CLIENTE');
    await db.runAsync('DELETE FROM alFAC_RUTA_ORDEN');
    await db.runAsync('DELETE FROM CLIENTE_UBICACION');
    if (traeEfectividades) await db.runAsync('DELETE FROM EFECT_VISITA_RT');
    if (traeNiveles) await db.runAsync('DELETE FROM NIVEL_LISTA');
    if (traeTiposCliente) await db.runAsync('DELETE FROM alFAC_TIP_CLT');

    for (const t of tiposCliente) {
      await db.runAsync('INSERT OR REPLACE INTO alFAC_TIP_CLT (COD_CIA, COD_TIP_CL, DES_TIP_CL) VALUES (?, ?, ?)', [
        text(t.COD_CIA),
        textOr(t.COD_TIP_CL),
        textOr(t.DES_TIP_CL),
      ]);
    }

    for (const n of nivelesPrecio) {
      await db.runAsync(
        'INSERT OR REPLACE INTO NIVEL_LISTA (NIVEL_PRECIO, COMPANIA, LISTA, MONEDA) VALUES (?, ?, ?, ?)',
        [textOr(n.NIVEL_PRECIO), text(n.COMPANIA), num(n.LISTA), textOr(n.MONEDA)]
      );
    }

    for (const r of rutas) {
      await db.runAsync(
        'INSERT OR REPLACE INTO RUTA_RT (RUTA, DESCRIPCION, ACTIVA, PERIODICIDAD) VALUES (?, ?, ?, ?)',
        [textOr(r.RUTA), text(r.DESCRIPCION), text(r.ACTIVA), text(r.PERIODICIDAD)]
      );
    }

    for (const c of clientes) {
      await db.runAsync(
        `INSERT OR REPLACE INTO CLIENTE
           (COD_CLT, NOM_CLT, DIR_CLT, FEC_PLN, COD_ZON, DESGLOSE, TIPO_IMPUESTO, TIPO_TARIFA, PORC_TARIFA,
            NIVEL_PRECIO)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          textOr(c.COD_CLT),
          textOr(c.NOM_CLT),
          textOr(c.DIR_CLT),
          text(c.FEC_PLN),
          textOr(c.COD_ZON),
          text(c.DESGLOSE),
          text(c.TIPO_IMPUESTO),
          text(c.TIPO_TARIFA),
          num(c.PORC_TARIFA),
          // El backend lo manda como nivel_precio; se acepta también en mayúscula como el resto.
          text(c.nivel_precio ?? c.NIVEL_PRECIO),
        ]
      );
    }

    for (const o of rutaOrden) {
      await db.runAsync(
        'INSERT OR REPLACE INTO alFAC_RUTA_ORDEN (COD_ZON, COD_CLT, DIA, ORDEN) VALUES (?, ?, ?, ?)',
        [textOr(o.RUTA), textOr(o.CLIENTE), textOr(o.DIA), num(o.ORDEN) ?? 0]
      );
    }

    for (const u of ubicaciones) {
      await db.runAsync(
        // Vienen del servidor: ya están enviadas (ENVIADO = 1).
        'INSERT OR REPLACE INTO CLIENTE_UBICACION (RUTA, CLIENTE, LATITUD, LONGITUD, ALTITUD, ENVIADO) VALUES (?, ?, ?, ?, ?, 1)',
        [textOr(u.RUTA), textOr(u.CLIENTE), num(u.LATITUD), num(u.LONGITUD), num(u.ALTITUD)]
      );
    }

    for (const e of efectividades) {
      await db.runAsync('INSERT OR REPLACE INTO EFECT_VISITA_RT (EFECT_VISITA, DESCRIPCION) VALUES (?, ?)', [
        textOr(e.EFECT_VISITA),
        text(e.DESCRIPCION),
      ]);
    }

    await db.runAsync(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sync_clientes_at', ?)",
      [new Date().toISOString()]
    );
  });

  return {
    rutas: rutas.length,
    clientes: clientes.length,
    asignaciones: rutaOrden.length,
    ubicaciones: ubicaciones.length,
    efectividades: efectividades.length,
    omitidos,
  };
}
