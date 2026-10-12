# Facturación de ruteo (Coagro) — Contexto del proyecto

Documento de contexto para nuevos chats. Estado al 6 de octubre de 2026.

## 1. Qué es

App móvil (handheld) para facturar según rutas asignadas, conectada a un sistema web propio. Estilo Softland Exactus. Debe funcionar **sin internet** (todo contra SQLite local) y sincronizar con el backend cuando haya conexión.

- Proyecto en la PC del usuario: `C:\dev\Coagro\facturacionRuteoMobile\coagro-facturacionruteo`
- Stack: Expo SDK 57, React Native 0.86, React 19. Se prueba en Android con Expo Go.
- `AGENTS.md` del proyecto indica usar **Expo Router** (aún no migrado: `App.js` navega con `useState`) y `npx expo install` para dependencias.
- Librerías: `expo-sqlite`, `expo-file-system` (API nueva: `File`, `Paths`), `expo-crypto`.

## 2. Principios de diseño acordados

- Offline-first: la UI lee de repositorios que leen de SQLite; nunca directo de la red.
- Datos maestros (clientes, rutas) se **descargan**; los datos transaccionales (facturas, visitas) se **subirán** después (cola de salida aún no construida).
- Un handheld puede tener varias rutas.
- Rangos de NCF **pre-asignados por handheld** (tabla `NCF_CONSECUTIVO_RT`).
- Todas las funciones deben funcionar offline.

## 3. Flujo implementado

1. **Primer uso** (no existe config JSON ni base SQLite): pantalla **Conexión** con dirección del servidor, handheld, correo y contraseña (todos obligatorios, contraseña mínimo 6). Se guarda `coagro-config.json` con la conexión y el usuario (contraseña con sal y hash SHA-256 de 1000 iteraciones).
2. **Login local**: valida contra ese JSON. Si es correcto, abre/crea SQLite y aplica migraciones.
3. **Home → Clientes** con dos pestañas: **Validar** (lista) y **Sincronizar** (descarga).
4. **Sin login para sincronizar**: la app hace un `GET` simple al backend, sin token. (Decisión del usuario: "solo necesito sincronizar los datos que me envíe el backend".)
5. **Reset de desarrollo**: mantener presionado el logo en el Login borra config y base (solo `__DEV__`).

## 4. Base de datos local (SQLite)

- Esquema generado desde `ExactusConfiguration.xml`: **112 tablas / 1387 columnas** (`src/db/schema.generated.js`, generador `tools/generate-schema.mjs <ruta-xml>`). Mapeo de tipos: 12/10/9 → TEXT, 0/16 → INTEGER, 2/7 → REAL.
- Columnas de compañía (`COD_CIA`, `COMPANIA`, `compania`): **opcionales** (NULL, sin default, fuera de las llaves primarias; excepción: tabla `COMPANIA`). El sistema no maneja compañías.
- Migraciones con `PRAGMA user_version`: v1 `app_meta`, v2 esquema Exactus, v3 `RUTA_RT`.
- Tablas que se llenan hoy al sincronizar: `RUTA_RT`, `CLIENTE` (llave `COD_CLT + COD_ZON`), `alFAC_RUTA_ORDEN`, `CLIENTE_UBICACION`, y `app_meta('sync_clientes_at')`. Todo en **una transacción** (si falla, no cambia nada).
- Día de la semana: la API manda 1–7 (1 = Lunes); se guarda como texto `'1'..'7'` en `alFAC_RUTA_ORDEN.DIA`.

## 5. Backend (Express + Sequelize + SQL Server)

- Base `COAGRO2`, esquema `erpadmin`. Respuestas con forma `{ result, success, errors }`, a menudo con HTTP 200 aunque falle.
- Rutas montadas bajo **`/api/v1`** (confirmado: `http://localhost:5000/api/v1/fr/sync/clientes`).
- Endpoint de sincronización (archivos entregados): `controllers/fr/sync.js` y `routes/fr/sync.js`. **Debe registrarse SIN el middleware de sesión** (si no, responde "no existe la sesión"). Advertencia: queda abierto a quien llegue al servidor; antes de producción conviene exigir algo (clave o identificador de handheld).
- `GET /fr/sync/clientes` (opcional `?ruta=001` o `?ruta=001,002`) devuelve `{ rutas, clientes, rutaOrden, ubicaciones }` ya con la forma de las tablas locales.

### De dónde salen los datos (decisión vigente)

| Dato | Fuente |
|---|---|
| Qué clientes van en cada ruta, día y orden | `rutaCliente` (modelo `rutaClienteModel`) |
| Nombre, dirección y demás datos del cliente | `COAGRO2.erpadmin.cliente` (unión `rutaCliente.CLIENTE = erpadmin.cliente.COD_CLT`) |
| Nombre de la ruta (para los filtros) | `rutaRt.DESCRIPCION`, **solo** para nombrar las rutas |
| Ubicaciones GPS | Sin fuente por ahora: se envía lista vacía |
| RNC y límite de crédito | Sin fuente: no existen en ninguna tabla conocida |

Reglas:
- Una fila de cliente por cada (ruta, cliente) asignado; `COD_ZON` es la ruta de la **asignación**, así un cliente puede estar en varias rutas.
- Una asignación cuyo cliente no existe en `erpadmin.cliente` (ej. `CLI01`) no se envía.
- Consultas por lotes de 500 (SQL Server limita los parámetros por consulta).
- **Ya no se consultan** `clienteAsocRt` ni `clienteRt` (el usuario pidió quitarlas). Nota: `CLIENTE_ASOC_RT` relaciona `CODIGO` (código handheld) con `CLIENTE` (código ERP) y `CLIENTE_RT` guarda nombre y coordenadas; hoy en los datos reales ambos códigos son iguales.
- Ruta de `rutaCliente`: el usuario la llama "erp.rutaCliente"; se usa el modelo Sequelize existente para no depender del nombre exacto de tabla/esquema.

## 6. Pantalla Clientes → Validar

La tabla lista los clientes de la ruta elegida. Un cliente aparece si:
1. Existe en `CLIENTE` local y su ruta coincide con el filtro.
2. Tiene asignación en esa ruta (`alFAC_RUTA_ORDEN`); si se elige un día, la asignación debe ser de ese día. Con día **"Todos"** (valor por defecto) sale una sola vez.
3. Cumple el **Estado** (por defecto "Todos"): *Visitados* = hay una visita de hoy en la tabla local `VISITA`; *No visitados* = no la hay. Aún no existe la pantalla que crea visitas, así que hoy todos salen como no visitados.
4. Coincide con la **búsqueda** (por código o por nombre; sin distinguir mayúsculas ni acentos).

Filtros: Ruta (muestra `código - nombre`), Día (Todos, Lunes…Sábado), Estado (Todos, Visitados, No visitados), cada uno con lista modal real. Orden: alfabético (opción) o por día y orden de visita. La columna RNC muestra "RNC no disponible".

## 7. Conectividad en desarrollo

Teléfono y PC estaban en subredes distintas, así que se usa **USB + adb reverse**:

1. Teléfono por cable, modo USB "Transferir archivos" (con "solo carga" no se detecta), depuración USB activa.
2. `adb devices` debe listar el equipo.
3. `adb reverse tcp:5000 tcp:5000` (se pierde si se desconecta el cable; verificar con `adb reverse --list`).
4. En la pantalla de Conexión escribir **`localhost:5000`** (sin `http://` ni `/api/v1`; la app los agrega).
5. Backend encendido en el puerto 5000. Expo Go permite http en desarrollo. Si Metro no toma cambios: `npx expo start -c`.

Se descartó VPN en el móvil. Producción (HTTPS, dirección real del servidor) está pendiente.

## 8. Archivos clave de la app

- `App.js`: estados loading/connection/login/home/module.
- `src/services/`: `localConfig.js`, `security.js`, `api.js` (`getJson`, `ApiError`), `syncClientes.js`. `session.js` está **sin uso** y puede borrarse.
- `src/config/api.js`: `API_PREFIX = '/api/v1'`, `PATHS.syncClientes = '/fr/sync/clientes'`, `TIMEOUT_MS = 15000`.
- `src/db/`: `database.js`, `migrations.js`, `schema.generated.js`.
- `src/repositories/clientes.js`: `getRutas`, `getClientesRuta`, `getUltimaSincronizacion`, `contarClientes`.
- `src/screens/`: `ConnectionScreen`, `LoginScreen`, `clientes/ClientesScreen`, `ValidarView`, `SincronizarView`.
- `src/components/`: `ui/` (`SelectField` con modal, `TextField`, `PrimaryButton`, etc.), `clientes/ClientTable`.
- `src/data/clientes.js`: constantes `DIAS`, `DIAS_FILTRO`, `ESTADOS` (y datos de ejemplo antiguos).

## 9. Pendiente / próximos pasos

- Probar todo desde cero con `localhost:5000` (reset → conexión → login → sincronizar → validar).
- RNC y límite de crédito: definir su fuente (irían en `CLIENTE_CIA.CONTRIBUYENTE` y `LIM_CRE`).
- GPS de clientes: definir fuente (antes `CLIENTE_RT`).
- Otras tablas del esquema (artículos, precios, etc.): "más adelante".
- Facturación offline, visitas, rangos NCF, y **cola de subida** (outbox con ids idempotentes) para enviar al backend.
- Migrar la navegación a **Expo Router**.
- Seguridad del endpoint de sincronización; HTTPS en producción; pantalla para editar la conexión; login local contra la tabla de usuarios del ERP.
- Duda abierta: el campo `FEC_PLN` no coincide con el día de la asignación; hoy se guarda pero no se usa.

## 10. Convenciones de trabajo

- El usuario va guiando paso a paso; confirmar el alcance antes de construir cosas grandes.
- Verificar con pruebas reales (se usó un arnés con SQLite real) antes de entregar.
- Responder en español.
