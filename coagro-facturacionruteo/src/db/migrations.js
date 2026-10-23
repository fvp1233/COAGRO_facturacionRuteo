import { EXACTUS_SCHEMA } from './schema.generated';

// Migraciones del esquema SQLite, en orden. La posición en el arreglo define la versión:
// migrations[0] -> versión 1, migrations[1] -> versión 2, ...
//
// Reglas:
//  - Nunca se edita una migración ya publicada; se agrega una nueva al final.
//  - Cada migración recibe `db` y se ejecuta dentro de una transacción.
export const migrations = [
  // v1: metadatos del dispositivo.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);
  },

  // v2: esquema de Exactus (112 tablas), generado desde ExactusConfiguration.xml con
  // `node tools/generate-schema.mjs <ruta-al-xml>`. Las columnas de compañía (COD_CIA /
  // COMPANIA) son opcionales y no forman parte de las llaves primarias.
  // Una vez distribuida la app, si el XML cambia NO se regenera esta migración: se agrega
  // una v3 con los cambios (SQLite no permite quitar NOT NULL con ALTER, requiere recrear la tabla).
  async (db) => {
    for (const statement of EXACTUS_SCHEMA) {
      await db.execAsync(statement);
    }
  },

  // v3: catálogo de rutas (nombre/descripción). No existe en el esquema de Exactus; viene
  // del endpoint de sincronización de tu backend (RUTA_RT).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS RUTA_RT (
        RUTA         TEXT PRIMARY KEY NOT NULL,
        DESCRIPCION  TEXT,
        ACTIVA       TEXT,
        PERIODICIDAD TEXT
      );
    `);
  },

  // v4: estados de visita (erpadmin.EFECT_VISITA_RT). Se descargan con "Cargar datos" y alimentan
  // el combo Estado del registro de visita; el id se guarda en VISITA.RAZON.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS EFECT_VISITA_RT (
        EFECT_VISITA TEXT PRIMARY KEY NOT NULL,
        DESCRIPCION  TEXT
      );
    `);
  },

  // v5: documentos pendientes de cobro (alCXC_PEN_COB). El endpoint de cobros también manda
  // INDICADOR_FACTURACION, que no viene en el esquema de Exactus.
  async (db) => {
    await db.execAsync('ALTER TABLE alCXC_PEN_COB ADD COLUMN INDICADOR_FACTURACION TEXT;');
  },

  // v6: rutas de la handheld con su grupo de artículos y bodegas (llegan en /fr/sync/articulos).
  // BODEGA es el código de ruteo (puede ser un alias, ej. "CLI1"); BODEGA_ERP es la bodega real
  // del ERP (ej. "10") y es la que se cruza con ARTICULO_EXISTENCIA.BODEGA. Puede venir null si
  // la bodega de la ruta está mal configurada.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS RUTA_ARTICULO_RT (
        RUTA           TEXT PRIMARY KEY NOT NULL,
        GRUPO_ARTICULO TEXT,
        BODEGA         TEXT,
        BODEGA_ERP     TEXT
      );
    `);
  },

  // v7: CLIENTE_CIA con NOM_CTO, NUM_TEL y LST_PRE opcionales: el backend puede mandarlos null y
  // no se deben guardar valores inventados ('' / 0). SQLite no permite quitar NOT NULL con ALTER:
  // se recrea la tabla y se copian las filas.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE CLIENTE_CIA_V7 (
        "COD_CIA" TEXT,
        "COD_CLT" TEXT NOT NULL,
        "COD_TIP_CL" TEXT,
        "NOM_CTO" TEXT,
        "NUM_TEL" TEXT,
        "LIM_CRE" REAL NOT NULL,
        "DIA_CRE" INTEGER NOT NULL,
        "LST_PRE" INTEGER,
        "POR_EXC_VT" REAL,
        "POR_EXC_CS" REAL,
        "IND_MON" TEXT,
        "COD_CND" TEXT,
        "COD_PAIS" TEXT,
        "DIR_EMB_DEFAULT" TEXT,
        "DESCUENTO" REAL NOT NULL,
        "BODEGA_CONSIGNA" TEXT NOT NULL DEFAULT 'ND',
        "MULT_MON" TEXT,
        "ACEPTA_FRACCIONES" TEXT,
        "TIPO_CONTRIBUYENTE" TEXT,
        "CONTRIBUYENTE" TEXT,
        "DIVISION_GEOGRAFICA1" TEXT,
        "DIVISION_GEOGRAFICA2" TEXT,
        "REGIMEN_TRIB" TEXT,
        "LOCALIZACION_CONSIGNA" TEXT DEFAULT 'ND',
        "CODIGO" TEXT,
        "RAZONSOCIAL" TEXT,
        "USA_MONTO_TOPE" TEXT NOT NULL DEFAULT 'N',
        "MONTO_TOPE" REAL,
        "CATEGORIA_TIPO_NIT" TEXT,
        "SUBTIPODOC" TEXT,
        PRIMARY KEY ("COD_CLT")
      );
      INSERT INTO CLIENTE_CIA_V7 SELECT * FROM CLIENTE_CIA;
      DROP TABLE CLIENTE_CIA;
      ALTER TABLE CLIENTE_CIA_V7 RENAME TO CLIENTE_CIA;
    `);
  },

  // v8: nivel de precio del cliente (nombre, ej. "DETALLISTA"). Llega en /fr/sync/clientes y
  // reemplaza el cruce LST_PRE/IND_MON contra NIVEL_LISTA, que no coincidía con el ERP.
  async (db) => {
    await db.execAsync('ALTER TABLE CLIENTE ADD COLUMN NIVEL_PRECIO TEXT;');
  },

  // v9: control de envío al servidor (POST /fr/sync/enviar) de lo que se registra en el equipo.
  // ENVIADO 0 = pendiente, 1 = ya está en el servidor; ERROR_ENVIO = último error del servidor.
  // Las coordenadas que ya había llegaron del servidor: quedan como enviadas.
  async (db) => {
    for (const tabla of ['VISITA', 'alFAC_ENC_PED', 'CLIENTE_UBICACION']) {
      await db.execAsync(`
        ALTER TABLE ${tabla} ADD COLUMN ENVIADO INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE ${tabla} ADD COLUMN FECHA_ENVIO TEXT;
        ALTER TABLE ${tabla} ADD COLUMN ERROR_ENVIO TEXT;
      `);
    }
    await db.execAsync('UPDATE CLIENTE_UBICACION SET ENVIADO = 1;');
  },
];
