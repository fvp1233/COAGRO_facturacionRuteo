import { getJson, ApiError } from './api';
import { PATHS } from '../config/api';

// Del servidor llegan campos de SQL Server (a veces con espacios al final): se limpian.
const text = (v) => (v === null || v === undefined ? null : String(v).trim());
const textOr = (v, fallback = '') => text(v) ?? fallback;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Columnas de CLIENTE_CIA (mismo nombre que erpadmin.CLIENTE_CIA). Llegan en el mismo objeto de
// clientes[] (bloque CLIENTE_CIA). SAL_CRE llega del servidor pero no existe en la tabla local.
// Las columnas NOT NULL llevan su valor por defecto si vienen null.
const CIA_NUMERICAS = ['LIM_CRE', 'DIA_CRE', 'LST_PRE', 'POR_EXC_VT', 'POR_EXC_CS', 'DESCUENTO', 'MONTO_TOPE'];
const CIA_DEFAULTS = { LIM_CRE: 0, DIA_CRE: 0, DESCUENTO: 0, BODEGA_CONSIGNA: 'ND', USA_MONTO_TOPE: 'N' };
const CIA_COLUMNAS = [
  'COD_CIA', 'COD_CLT', 'COD_TIP_CL', 'NOM_CTO', 'NUM_TEL', 'LIM_CRE', 'DIA_CRE', 'LST_PRE',
  'POR_EXC_VT', 'POR_EXC_CS', 'IND_MON', 'COD_CND', 'COD_PAIS', 'DIR_EMB_DEFAULT', 'DESCUENTO',
  'BODEGA_CONSIGNA', 'MULT_MON', 'ACEPTA_FRACCIONES', 'TIPO_CONTRIBUYENTE', 'CONTRIBUYENTE',
  'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'DIVISION_GEOGRAFICA3', 'REGIMEN_TRIB', 'LOCALIZACION_CONSIGNA', 'CODIGO',
  'RAZONSOCIAL', 'USA_MONTO_TOPE', 'MONTO_TOPE', 'CATEGORIA_TIPO_NIT', 'SUBTIPODOC',
  'codActividad', 'desActividad', 'nomEncargadoCompras', 'telEncargadoCompras', 'nomEncargadoPagos',
  'telEncargadoPagos',
];
const valorCia = (fila, col) => {
  if (col === 'COD_CLT') return textOr(fila.COD_CLT);
  const v = CIA_NUMERICAS.includes(col) ? num(fila[col]) : text(fila[col]);
  return v ?? CIA_DEFAULTS[col] ?? null;
};

// Catálogos que acompañan a CLIENTE_CIA en el pedido (país, departamentos, municipios, distritos,
// condición de pago, subtipos de documento y actividad comercial). Si el servidor manda el arreglo
// (aunque venga vacío) reemplaza la tabla local; si no lo manda (p. ej. divisiones3, que aún no
// existe), la tabla no se toca. `claves` = campos obligatorios (las filas sin ellos se descartan).
// No se filtra por compañía: cada catálogo trae la suya (CINCOH, COAGRO...).
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
    arreglo: 'divisiones3',
    tabla: 'DIVISION_GEOGRAFICA3',
    columnas: ['PAIS', 'COMPANIA', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'DIVISION_GEOGRAFICA3', 'NOMBRE'],
    claves: ['PAIS', 'DIVISION_GEOGRAFICA1', 'DIVISION_GEOGRAFICA2', 'DIVISION_GEOGRAFICA3', 'NOMBRE'],
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

// Descarga rutas, clientes (CLIENTE y CLIENTE_CIA), asignaciones, ubicaciones y catálogos
// (reemplazan las tablas locales).
// Solo descarga y valida: no toca la base. Devuelve { guardar(db), resumen }; DatosScreen llama
// guardar dentro de UNA transacción con el resto de la carga (o se guarda todo o no se toca nada).
export async function descargarClientes() {
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
  // servidor no los manda, las tablas no se tocan.
  // En pedidos/facturas se guarda NIVEL_PRECIO (el nombre), nunca LST_PRE. El nivel de cada
  // cliente llega en clientes[].nivel_precio; NIVEL_LISTA solo es el catálogo para elegir.
  const traeNiveles = Array.isArray(data.nivelesPrecio);
  const nivelesPrecio = conClaves(data.nivelesPrecio, ['NIVEL_PRECIO', 'LISTA', 'MONEDA']);
  const traeTiposCliente = Array.isArray(data.tiposCliente);
  const tiposCliente = conClaves(data.tiposCliente, ['COD_TIP_CL']);
  // Datos comerciales (CLIENTE_CIA): vienen en el mismo objeto de cada cliente. Un cliente sale
  // una vez por ruta, con los mismos datos de CLIENTE_CIA: se deja uno por COD_CLT (la llave
  // local). Si el cliente no tiene fila en el ERP, el bloque viene en null (COD_CIA null) y no se
  // guarda nada para él.
  const clientesCia = [
    ...new Map(clientes.filter((c) => textOr(c.COD_CIA) !== '').map((c) => [textOr(c.COD_CLT), c])).values(),
  ];
  const catalogos = CATALOGOS.filter((c) => Array.isArray(data[c.arreglo])).map((c) => ({
    ...c,
    filas: conClaves(data[c.arreglo], c.claves),
  }));
  const omitidos =
    catalogos.reduce((n, c) => n + data[c.arreglo].length - c.filas.length, 0) +
    (Array.isArray(data.rutas) ? data.rutas.length : 0) - rutas.length +
    data.clientes.length - clientes.length +
    data.rutaOrden.length - rutaOrden.length +
    (Array.isArray(data.ubicaciones) ? data.ubicaciones.length : 0) - ubicaciones.length;

  const guardar = async (db) => {
    // Los maestros se reemplazan completos con lo que manda el servidor.
    await db.runAsync('DELETE FROM RUTA_RT');
    await db.runAsync('DELETE FROM CLIENTE');
    await db.runAsync('DELETE FROM CLIENTE_CIA');
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

    for (const c of clientesCia) {
      await db.runAsync(
        `INSERT OR REPLACE INTO CLIENTE_CIA (${CIA_COLUMNAS.join(', ')})
         VALUES (${CIA_COLUMNAS.map(() => '?').join(', ')})`,
        CIA_COLUMNAS.map((col) => valorCia(c, col))
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
  };

  const resumen = {
    rutas: rutas.length,
    clientes: clientes.length,
    clientesCia: clientesCia.length,
    asignaciones: rutaOrden.length,
    ubicaciones: ubicaciones.length,
    efectividades: efectividades.length,
    omitidos,
  };
  return { guardar, resumen };
}
