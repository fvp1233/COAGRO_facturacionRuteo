import { getJson, ApiError } from './api';
import { getDatabase } from '../db/database';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Columnas de CLIENTE_CIA (mismo nombre que erpadmin.CLIENTE_CIA). SAL_CRE llega del servidor pero
// no existe en la tabla local. Las columnas NOT NULL llevan su valor por defecto si vienen null.
const NUMERICAS = ['LIM_CRE', 'DIA_CRE', 'LST_PRE', 'POR_EXC_VT', 'POR_EXC_CS', 'DESCUENTO', 'MONTO_TOPE'];
const DEFAULTS = { LIM_CRE: 0, DIA_CRE: 0, DESCUENTO: 0, BODEGA_CONSIGNA: 'ND', USA_MONTO_TOPE: 'N' };
const COLUMNAS = [
  'COD_CIA', 'COD_CLT', 'COD_TIP_CL', 'NOM_CTO', 'NUM_TEL', 'LIM_CRE', 'DIA_CRE', 'LST_PRE',
  'POR_EXC_VT', 'POR_EXC_CS', 'IND_MON', 'COD_CND', 'COD_PAIS', 'DIR_EMB_DEFAULT', 'DESCUENTO',
  'BODEGA_CONSIGNA', 'MULT_MON', 'ACEPTA_FRACCIONES', 'TIPO_CONTRIBUYENTE', 'CONTRIBUYENTE',
  'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'REGIMEN_TRIB', 'LOCALIZACION_CONSIGNA', 'CODIGO',
  'RAZONSOCIAL', 'USA_MONTO_TOPE', 'MONTO_TOPE', 'CATEGORIA_TIPO_NIT', 'SUBTIPODOC',
];

const valor = (fila, col) => {
  if (col === 'COD_CLT') return textOr(fila.COD_CLT);
  const v = NUMERICAS.includes(col) ? num(fila[col]) : text(fila[col]);
  return v ?? DEFAULTS[col] ?? null;
};

// Catálogos que acompañan a CLIENTE_CIA en el pedido (país, regiones, condición de pago, subtipos
// de documento y actividad comercial). Opcionales: si el servidor no manda el arreglo, la tabla
// local no se toca. `claves` = campos obligatorios (las filas sin ellos se descartan).
const CATALOGOS = [
  {
    arreglo: 'paises',
    tabla: 'alFAC_PAIS',
    columnas: ['COD_PAIS', 'COD_CIA', 'NOMBRE', 'ETIQUETA_DIV_GEO1', 'ETIQUETA_DIV_GEO2'],
    claves: ['COD_PAIS', 'NOMBRE'],
  },
  {
    arreglo: 'divisiones1',
    tabla: 'DIVISION_GEOGRAFICA1',
    columnas: ['PAIS', 'COMPANIA', 'DIVISION_GEOGRAFICA1', 'NOMBRE'],
    claves: ['PAIS', 'DIVISION_GEOGRAFICA1', 'NOMBRE'],
  },
  {
    arreglo: 'divisiones2',
    tabla: 'DIVISION_GEOGRAFICA2',
    columnas: ['PAIS', 'COMPANIA', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'NOMBRE'],
    claves: ['PAIS', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'NOMBRE'],
  },
  {
    arreglo: 'condicionesPago',
    tabla: 'alFAC_CND_PAG',
    columnas: ['COD_CND', 'COD_CIA', 'CAN_DIA', 'DES_CND'],
    claves: ['COD_CND', 'DES_CND'],
    numericas: ['CAN_DIA'],
  },
  {
    arreglo: 'subtiposDoc',
    tabla: 'SUBTIPO_DOC',
    columnas: ['COMPANIA', 'TIPO', 'SUBTIPO', 'DESCRIPCION'],
    claves: ['TIPO', 'SUBTIPO', 'DESCRIPCION'],
  },
  {
    arreglo: 'actividadesComerciales',
    tabla: 'ACTIVIDAD_COMERCIAL',
    columnas: ['compania', 'codigo', 'descripcion'],
    claves: ['codigo'],
  },
];

// Descarga los datos comerciales de los clientes de la handheld (CLIENTE_CIA) y sus catálogos, y
// los guarda en SQLite en UNA transacción: o se guarda todo o no se toca nada. Devuelve un resumen
// con los conteos.
// La tabla local tiene llave COD_CLT: si un cliente trae filas de varias compañías, queda la última.
export async function syncClientesCia() {
  const json = await getJson(PATHS.syncClientesCia);
  const data = json?.result;
  if (!data || !Array.isArray(data.clientesCia)) {
    throw new ApiError('La respuesta del servidor no tiene el formato esperado (clientesCia).');
  }
  const conClaves = (lista, claves) =>
    (Array.isArray(lista) ? lista : []).filter(
      (fila) => fila && typeof fila === 'object' && claves.every((k) => textOr(fila[k]) !== '')
    );
  const clientesCia = conClaves(data.clientesCia, ['COD_CLT']);
  const catalogos = CATALOGOS.filter((c) => Array.isArray(data[c.arreglo])).map((c) => ({
    ...c,
    filas: conClaves(data[c.arreglo], c.claves),
  }));
  const omitidos =
    data.clientesCia.length - clientesCia.length +
    catalogos.reduce((n, c) => n + data[c.arreglo].length - c.filas.length, 0);

  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM CLIENTE_CIA');
    for (const c of clientesCia) {
      await db.runAsync(
        `INSERT OR REPLACE INTO CLIENTE_CIA (${COLUMNAS.join(', ')})
         VALUES (${COLUMNAS.map(() => '?').join(', ')})`,
        COLUMNAS.map((col) => valor(c, col))
      );
    }

    for (const { tabla, columnas, numericas = [], filas } of catalogos) {
      await db.runAsync(`DELETE FROM ${tabla}`);
      for (const f of filas) {
        await db.runAsync(
          `INSERT OR REPLACE INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
          columnas.map((col) => (numericas.includes(col) ? num(f[col]) ?? 0 : text(f[col])))
        );
      }
    }
  });

  return { clientesCia: clientesCia.length, omitidos };
}
