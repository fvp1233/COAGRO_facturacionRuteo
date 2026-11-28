// Publica una actualización de la app (EAS Update) a los teléfonos con el APK del canal "preview".
//
// Uso (desde la raíz del proyecto):
//   npm run publicar -- "Descripción del cambio"
//
// Antes de publicar revisa que src/config/api.js apunte al servidor en línea: lo que se sube es el
// código tal como está en esta PC, y una URL local dejaría a todos los vendedores sin conexión.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_EN_LINEA = 'http://190.5.130.250:5000';
const CANAL = 'preview';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function salir(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

const mensaje = process.argv.slice(2).join(' ').trim();
if (!mensaje) {
  salir('Falta la descripción del cambio.\n  Uso: npm run publicar -- "Descripción del cambio"');
}

// Línea activa (no comentada) de BASE_URL en src/config/api.js.
const api = readFileSync(join(raiz, 'src', 'config', 'api.js'), 'utf8');
const activas = api
  .split(/\r?\n/)
  .filter((l) => /^\s*export\s+const\s+BASE_URL\s*=/.test(l));
if (activas.length !== 1) {
  salir(`src/config/api.js debe tener exactamente una línea activa de BASE_URL (tiene ${activas.length}).`);
}
const valor = activas[0].match(/=\s*(?:'([^']*)'|"([^"]*)"|(null))/);
const baseUrl = valor ? (valor[1] ?? valor[2] ?? null) : undefined;
if (baseUrl !== URL_EN_LINEA) {
  salir(
    `BASE_URL no apunta al servidor en línea.\n` +
      `  Actual:   ${baseUrl === undefined ? activas[0].trim() : baseUrl}\n` +
      `  Esperada: ${URL_EN_LINEA}\n` +
      `  Corrige src/config/api.js y vuelve a intentar.`
  );
}

console.log(`✔ BASE_URL = ${baseUrl}`);
console.log(`→ Publicando en el canal "${CANAL}": ${mensaje}\n`);

// En Windows npx es un .cmd y solo se puede lanzar con shell: el mensaje va entre comillas.
const comillas = (s) => `"${s.replace(/"/g, '\\"')}"`;
const comando = [
  'npx', 'eas-cli', 'update',
  '--channel', CANAL,
  // Variables de entorno de EAS del mismo ambiente que el APK (si no, eas-cli pregunta cuál usar).
  '--environment', CANAL,
  '--platform', 'android',
  '--message', comillas(mensaje),
].join(' ');

const r = spawnSync(comando, { cwd: raiz, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
