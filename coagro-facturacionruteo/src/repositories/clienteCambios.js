import { getDatabase } from '../db/database';
import { toSqlLocal } from './visitas';

// Campos del cliente que se pueden cambiar en Consultar > Cliente. La llave es el nombre del campo
// que se envía al servidor (CAMPO en CLIENTE_CAMBIO). tabla/columna = dónde está en la base local
// (los mismos nombres que en erpadmin). tipo:
//  - 'texto': texto libre (requerido = no puede quedar vacío; teclado = keyboardType).
//  - 'entero' / 'numero': número >= 0; 'porcentaje': número entre 0 y 100.
//  - 'opciones': se elige de un catálogo local (ver getOpcionesEdicion).
// Las columnas NOT NULL de la base local guardan '' cuando un texto queda vacío.
export const CAMPOS_CLIENTE = {
  NOM_CLT: { etiqueta: 'Nombre', tabla: 'CLIENTE', tipo: 'texto', requerido: true },
  DIR_CLT: { etiqueta: 'Dirección', tabla: 'CLIENTE', tipo: 'texto', multilinea: true },
  NOM_CTO: { etiqueta: 'Contacto', tabla: 'CLIENTE_CIA', tipo: 'texto', noNulo: true },
  NUM_TEL: { etiqueta: 'Teléfono', tabla: 'CLIENTE_CIA', tipo: 'texto', teclado: 'phone-pad', noNulo: true },
  codActividad: { etiqueta: 'Código de actividad', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  desActividad: { etiqueta: 'Descripción de actividad', tabla: 'CLIENTE_CIA', tipo: 'texto', multilinea: true },
  nomEncargadoCompras: { etiqueta: 'Encargado de compras', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  telEncargadoCompras: { etiqueta: 'Teléfono encargado de compras', tabla: 'CLIENTE_CIA', tipo: 'texto', teclado: 'phone-pad' },
  nomEncargadoPagos: { etiqueta: 'Encargado de pagos', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  telEncargadoPagos: { etiqueta: 'Teléfono encargado de pagos', tabla: 'CLIENTE_CIA', tipo: 'texto', teclado: 'phone-pad' },
  COD_TIP_CL: { etiqueta: 'Tipo cliente', tabla: 'CLIENTE_CIA', tipo: 'opciones', catalogo: 'tiposCliente' },
  NIVEL_PRECIO: { etiqueta: 'Nivel de precio', tabla: 'CLIENTE', tipo: 'opciones', catalogo: 'niveles' },
  // Divisiones geográficas: texto libre (el código lo escribe el vendedor); vacío = null.
  DIVISION_GEOGRAFICA1: { etiqueta: 'Departamento', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  DIVISION_GEOGRAFICA2: { etiqueta: 'Municipio', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  DIVISION_GEOGRAFICA3: { etiqueta: 'Distrito', tabla: 'CLIENTE_CIA', tipo: 'texto' },
  DIA_CRE: { etiqueta: 'Días de crédito', tabla: 'CLIENTE_CIA', tipo: 'entero' },
  LIM_CRE: { etiqueta: 'Límite de crédito', tabla: 'CLIENTE_CIA', tipo: 'numero' },
  POR_EXC_VT: { etiqueta: 'Exento imp. ventas', tabla: 'CLIENTE_CIA', tipo: 'porcentaje' },
  POR_EXC_CS: { etiqueta: 'Exento imp. selec. cons.', tabla: 'CLIENTE_CIA', tipo: 'porcentaje' },
  IND_MON: { etiqueta: 'Tipo de moneda', tabla: 'CLIENTE_CIA', tipo: 'opciones', catalogo: 'monedas' },
  DESCUENTO: { etiqueta: 'Desc. general', tabla: 'CLIENTE_CIA', tipo: 'porcentaje' },
};

// Catálogos para los campos de tipo 'opciones': { tiposCliente, niveles, monedas }, cada uno
// [{ codigo, descripcion }].
export async function getOpcionesEdicion() {
  const db = await getDatabase();
  const [tiposCliente, niveles] = await Promise.all([
    db.getAllAsync(
      `SELECT COD_TIP_CL AS codigo, MIN(DES_TIP_CL) AS descripcion
         FROM alFAC_TIP_CLT GROUP BY COD_TIP_CL ORDER BY MIN(DES_TIP_CL)`
    ),
    db.getAllAsync(
      'SELECT DISTINCT NIVEL_PRECIO AS codigo, NIVEL_PRECIO AS descripcion FROM NIVEL_LISTA ORDER BY NIVEL_PRECIO'
    ),
  ]);
  return {
    tiposCliente,
    niveles,
    monedas: [
      { codigo: 'L', descripcion: 'Local' },
      { codigo: 'D', descripcion: 'Dólar' },
    ],
  };
}

// Campos con cambios sin enviar del cliente: Set de CAMPO.
export async function getCamposPendientes(cliente) {
  const db = await getDatabase();
  const rows = await db.getAllAsync('SELECT CAMPO FROM CLIENTE_CAMBIO WHERE COD_CLT = ? AND ENVIADO = 0', [cliente]);
  return new Set(rows.map((r) => r.CAMPO));
}

// Valida y normaliza el valor capturado. Devuelve { valor } (texto, número o lista de días) o
// { error } con el mensaje para el usuario.
export function validarValor(campo, entrada) {
  const def = CAMPOS_CLIENTE[campo];
  if (def.tipo === 'opciones') {
    return entrada ? { valor: String(entrada) } : { error: `Selecciona ${def.etiqueta.toLowerCase()}.` };
  }
  const texto = String(entrada ?? '').trim();
  if (def.tipo === 'texto') {
    if (def.requerido && !texto) return { error: `${def.etiqueta} no puede quedar vacío.` };
    return { valor: texto };
  }
  // Numéricos: se acepta coma como separador decimal.
  const n = Number(texto.replace(',', '.'));
  if (!texto || !Number.isFinite(n)) return { error: `Escribe un número válido en ${def.etiqueta.toLowerCase()}.` };
  if (n < 0) return { error: `${def.etiqueta} no puede ser negativo.` };
  if (def.tipo === 'entero' && !Number.isInteger(n)) return { error: `${def.etiqueta} debe ser un número entero.` };
  if (def.tipo === 'porcentaje' && n > 100) return { error: `${def.etiqueta} no puede ser mayor que 100.` };
  return { valor: n };
}

const aTexto = (v) => (v == null ? null : String(v));

// Aplica los cambios en la base local y los deja pendientes de enviar. cambios: [{ campo, valor }]
// con el valor ya validado (validarValor). Todo en una transacción: o quedan todos, o ninguno.
export async function guardarCambiosCliente(cliente, cambios) {
  for (const { campo } of cambios) {
    if (!CAMPOS_CLIENTE[campo]) throw new Error(`Campo no editable: ${campo}`);
  }
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const { campo, valor } of cambios) await aplicarCambio(db, cliente, campo, valor);
  });
}

async function aplicarCambio(db, cliente, campo, valor) {
  const def = CAMPOS_CLIENTE[campo];
  const cia = await db.getFirstAsync('SELECT COD_CIA FROM CLIENTE_CIA WHERE COD_CLT = ?', [cliente]);

  // CLIENTE tiene una fila por ruta: los datos del cliente se cambian en todas.
  const fila = await db.getFirstAsync(`SELECT ${campo} AS v FROM ${def.tabla} WHERE COD_CLT = ?`, [cliente]);
  if (!fila) throw new Error('El cliente no tiene datos comerciales en la base local.');
  const anterior = fila.v;
  const guardado = def.tipo === 'texto' && valor === '' && !def.noNulo && def.tabla === 'CLIENTE_CIA' ? null : valor;
  await db.runAsync(`UPDATE ${def.tabla} SET ${campo} = ? WHERE COD_CLT = ?`, [guardado, cliente]);

  // Si el campo ya tenía un cambio sin enviar, se conserva su VALOR_ANTERIOR (el del servidor).
  await db.runAsync(
    `INSERT INTO CLIENTE_CAMBIO (COD_CLT, CAMPO, RUTA, COD_CIA, TABLA, VALOR_ANTERIOR, VALOR_NUEVO, FECHA, ENVIADO)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT (COD_CLT, CAMPO, RUTA) DO UPDATE SET
       VALOR_ANTERIOR = CASE WHEN ENVIADO = 1 THEN excluded.VALOR_ANTERIOR ELSE VALOR_ANTERIOR END,
       VALOR_NUEVO = excluded.VALOR_NUEVO, FECHA = excluded.FECHA, COD_CIA = excluded.COD_CIA,
       ENVIADO = 0, FECHA_ENVIO = NULL, ERROR_ENVIO = NULL`,
    [
      cliente,
      campo,
      '',
      cia?.COD_CIA ?? null,
      def.tabla,
      aTexto(anterior),
      aTexto(valor),
      toSqlLocal(new Date()),
    ]
  );
}
