import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';

import { migrations } from './migrations';

export const DB_NAME = 'coagro.db';

let dbPromise = null;

// ¿Existe ya el archivo de la base SQLite en el dispositivo?
export function databaseExists() {
  try {
    return new File(SQLite.defaultDatabaseDirectory, DB_NAME).exists;
  } catch {
    return false;
  }
}

async function runMigrations(db) {
  const row = await db.getFirstAsync('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (; version < migrations.length; version += 1) {
    await db.withTransactionAsync(async () => {
      await migrations[version](db);
    });
    // PRAGMA no admite parámetros; `version` es un entero interno.
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

// Abre (y crea si no existe) la base, y aplica las migraciones pendientes.
// Es seguro llamarla varias veces: reutiliza la misma conexión.
export function initDatabase() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await runMigrations(db);
      return db;
    })().catch((error) => {
      dbPromise = null; // permite reintentar si falló
      throw error;
    });
  }
  return dbPromise;
}

// SOLO DESARROLLO: cierra la conexión y borra el archivo de la base SQLite.
export async function resetDatabase() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.closeAsync();
    } catch {
      // si la conexión ya estaba rota, igual se intenta borrar el archivo
    }
    dbPromise = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch {
    // no existe: nada que borrar
  }
}

export function getDatabase() {
  return initDatabase();
}
