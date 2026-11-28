import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Descarga los documentos pendientes de cobro (alCXC_PEN_COB).
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
// Trae TODOS los documentos con saldo de los clientes de las rutas de la handheld, sin importar el
// vendedor; cada uno con su VENDEDOR (vendedor de la factura). result.vendedores = vendedor(es) del ERP
// de la handheld (para el filtro "Mis documentos" del Calendario); si no viene se usa el de las metas.
export function descargarCobros() {
  return descargarDocumentos(PATHS.syncCobros, 'alCXC_PEN_COB', 'sync_cobros_at', 'sync_cobros_vendedores');
}

// Igual que descargarCobros, pero solo los documentos que le toca cobrar al agente (vendedor) del
// token; se guardan aparte en alCXC_PEN_COB_AGENTE. El Calendario ya no la usa (filtra alCXC_PEN_COB
// por VENDEDOR); queda como respaldo del nombre del agente en Metas.
export function descargarCobrosAgente() {
  return descargarDocumentos(PATHS.syncCobrosAgente, 'alCXC_PEN_COB_AGENTE', 'sync_cobros_agente_at');
}

// tabla y metaKey son constantes de este archivo (no vienen del usuario). vendedoresKey: clave de
// app_meta donde guardar result.vendedores (solo si el servidor la manda).
async function descargarDocumentos(path, tabla, metaKey, vendedoresKey = null) {
  const json = await getJson(path);
  const data = json?.result;
  if (!data || !Array.isArray(data.documentos)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (documentos).');
  }
  // Se descartan filas sin sus campos clave (no se guardan códigos vacíos) y se informa cuántas.
  const documentos = data.documentos.filter(
    (fila) =>
      fila && typeof fila === 'object' &&
      ['COD_TIP_DC', 'COD_ZON', 'NUM_DOC', 'COD_CLT'].every((k) => textOr(fila[k]) !== '')
  );
  const omitidos = data.documentos.length - documentos.length;

  const guardar = async (db) => {
    // Los pendientes se reemplazan completos con lo que manda el servidor.
    await db.runAsync(`DELETE FROM ${tabla}`);

    for (const d of documentos) {
      await db.runAsync(
        `INSERT OR REPLACE INTO ${tabla}
           (COD_CIA, COD_ZON, COD_TIP_DC, NUM_DOC, COD_CLT, SALDO_DOLAR, SALDO_LOCAL,
            MONTO_DOLAR, MONTO_LOCAL, FEC_DOC_FT, FEC_PRO, FEC_VEN, IND_MON, IND_ANL, TIP_CMB_DOL,
            CONDICION_PAGO, SUBTOTAL, TIP_CMB_LOC, CLASE_DOCUMENTO, INCOTERMS, FORMAS_PAGO,
            NATURALEZA_OPERACION, CUFE, CODIGOQR, INDICADOR_FACTURACION, AGENTE, NOMBRE_AGENTE,
            VENDEDOR, NOMBRE_VENDEDOR)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          text(d.COD_CIA),
          textOr(d.COD_ZON),
          textOr(d.COD_TIP_DC),
          textOr(d.NUM_DOC),
          textOr(d.COD_CLT),
          num(d.SALDO_DOLAR) ?? 0,
          num(d.SALDO_LOCAL) ?? 0,
          num(d.MONTO_DOLAR) ?? 0,
          num(d.MONTO_LOCAL) ?? 0,
          textOr(d.FEC_DOC_FT),
          textOr(d.FEC_PRO),
          textOr(d.FEC_VEN),
          text(d.IND_MON),
          text(d.IND_ANL),
          num(d.TIP_CMB_DOL),
          text(d.CONDICION_PAGO),
          num(d.SUBTOTAL),
          num(d.TIP_CMB_LOC),
          text(d.CLASE_DOCUMENTO),
          text(d.INCOTERMS),
          text(d.FORMAS_PAGO),
          text(d.NATURALEZA_OPERACION),
          text(d.CUFE),
          text(d.CODIGOQR),
          text(d.INDICADOR_FACTURACION),
          text(d.AGENTE),
          text(d.NOMBRE_AGENTE),
          text(d.VENDEDOR),
          text(d.NOMBRE_VENDEDOR),
        ]
      );
    }

    await db.runAsync(
      'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
      [metaKey, new Date().toISOString()]
    );
    if (vendedoresKey && Array.isArray(data.vendedores)) {
      const vendedores = data.vendedores.map((v) => textOr(v)).filter(Boolean);
      await db.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', [
        vendedoresKey,
        JSON.stringify(vendedores),
      ]);
    }
  };

  const resumen = {
    documentos: documentos.length,
    omitidos,
  };
  return { guardar, resumen };
}
