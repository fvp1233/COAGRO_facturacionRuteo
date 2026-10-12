// Genera src/db/schema.generated.js a partir de ExactusConfiguration.xml.
//
// Uso (desde la raíz del proyecto):
//   node tools/generate-schema.mjs "C:/ruta/ExactusConfiguration.xml"
//
// IMPORTANTE: el XML trae servidor, usuario y contraseña (cifrada) de SQL Server en
// <datasource>. Este script NO lee ni copia esos datos, pero no guardes ni subas el XML
// dentro del repositorio.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) {
  console.error('Uso: node tools/generate-schema.mjs <ruta/ExactusConfiguration.xml>');
  process.exit(1);
}

// Se descarta <datasource> completo antes de interpretar nada (credenciales + caracteres
// no válidos en XML dentro del password cifrado).
const xml = readFileSync(input, 'utf8').replace(/<datasource>[\s\S]*?<\/datasource>/g, '');

// Códigos de tipo del XML -> tipo SQLite
//   12 texto | 10 texto largo | 9 fecha/hora (ISO 8601 en TEXT)
//   0 y 16 enteros | 2 y 7 decimales
const TYPE_MAP = { 12: 'TEXT', 10: 'TEXT', 9: 'TEXT', 0: 'INTEGER', 16: 'INTEGER', 2: 'REAL', 7: 'REAL' };

const q = (name) => `"${name.replace(/"/g, '""')}"`;
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s*/>|>([\\s\\S]*?)</${name}>)`));
  return m ? (m[1] ?? '') : null;
};

function sqlDefault(type, raw) {
  if (raw === null || raw === '' || raw === 'NULL') return '';
  if (TYPE_MAP[type] === 'TEXT') return ` DEFAULT '${raw.replace(/'/g, "''")}'`;
  return Number.isFinite(Number(raw)) ? ` DEFAULT ${Number(raw)}` : '';
}

const tables = [...xml.matchAll(/<table>([\s\S]*?)<\/table>/g)].map((m) => m[1]);
const statements = [];
let columnCount = 0;

// La compañía (empresa) del ERP no se usa en la app: sus columnas son opcionales (NULL),
// sin valor por defecto, y no forman parte de la llave primaria. Así la unicidad la dan
// los demás campos y no se cuelan duplicados por tener la compañía en NULL (en SQLite
// los NULL nunca se consideran iguales dentro de una llave).
// Excepción: en la tabla COMPANIA, COD_CIA sigue siendo su llave (no hay otra).
const COMPANY_COLUMNS = new Set(['cod_cia', 'compania']);
const isCompany = (fname) => COMPANY_COLUMNS.has(fname.toLowerCase());

for (const t of tables) {
  const name = tag(t, 'name');
  const fields = [...t.matchAll(/<field>([\s\S]*?)<\/field>/g)].map((m) => m[1]);
  const cols = [];
  const pk = [];
  const companyPk = [];

  for (const f of fields) {
    const fname = tag(f, 'name');
    const type = Number(tag(f, 'type'));
    if (!(type in TYPE_MAP)) throw new Error(`Tipo ${type} sin mapeo en ${name}.${fname}`);
    const company = isCompany(fname);
    const notNull = !company && tag(f, 'allownulls') === 'false' ? ' NOT NULL' : '';
    const dflt = company ? '' : sqlDefault(type, tag(f, 'defaultvalue'));
    cols.push(`  ${q(fname)} ${TYPE_MAP[type]}${notNull}${dflt}`);
    if (tag(f, 'primarykey') === 'true') (company ? companyPk : pk).push(q(fname));
  }
  // Si la compañía era la única llave de la tabla, se conserva como llave.
  const keys = pk.length ? pk : companyPk;
  if (keys.length) cols.push(`  PRIMARY KEY (${keys.join(', ')})`);
  columnCount += fields.length;
  statements.push(`CREATE TABLE IF NOT EXISTS ${q(name)} (\n${cols.join(',\n')}\n);`);
}

const out = `// ARCHIVO GENERADO por tools/generate-schema.mjs a partir de ExactusConfiguration.xml.
// No editar a mano: vuelve a ejecutar el script si cambia el XML.
//
// ${tables.length} tablas, ${columnCount} columnas. Tipos: texto -> TEXT, fechas -> TEXT (ISO 8601),
// enteros -> INTEGER, decimales -> REAL.
// Columnas de compañía (COD_CIA / COMPANIA): opcionales y fuera de la llave primaria.

export const EXACTUS_SCHEMA = ${JSON.stringify(statements, null, 2)};
`;

const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/db/schema.generated.js');
writeFileSync(target, out);
console.log(`OK: ${tables.length} tablas, ${columnCount} columnas -> ${target}`);
