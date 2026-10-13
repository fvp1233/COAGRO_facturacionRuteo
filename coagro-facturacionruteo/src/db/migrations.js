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
];
