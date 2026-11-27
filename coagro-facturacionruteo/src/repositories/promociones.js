import { getDatabase } from '../db/database';
import { claveArticulo, hoyISO, vigenciaDescuento, VIGENCIA } from './descuentos';

// Promociones de la web (FR_PROMOCION + FR_PROMOCION_DESTINO + FR_PROMOCION_PRODUCTO +
// FR_PROMOCION_BONIFICADO), unidas por PROMOCION_ID. Se descargan en Datos > Cargar datos.

// FR_PROMOCION_DESTINO.TIPO: a quién aplica la promoción (VALOR = código del cliente o de la ruta).
export const DESTINO = { cliente: 'C', ruta: 'R' };
// FR_PROMOCION_PRODUCTO.ALCANCE: cómo se buscan los artículos de la promoción.
export const ALCANCE = { articulo: 'A', linea: 'L', texto: 'T' };
// FR_PROMOCION.TIPO de las promociones que regalan artículos (FR_PROMOCION_BONIFICADO).
export const TIPO_BONIFICACION = 'B';

const norm = (v) => String(v ?? '').trim().toUpperCase();

// Promociones ACTIVAS que aplican al cliente: algún destino es el cliente (TIPO 'C') o su ruta
// (TIPO 'R'). Cada una trae su vigencia respecto a hoy y sus productos (con la descripción del
// artículo cuando el alcance es 'A'). Primero las vigentes, luego las próximas y al final las vencidas.
// bonificados: artículos que regala la promoción (FR_PROMOCION_BONIFICADO; ARTICULO_BONIFICADO /
// CANTIDAD_BONIFICADA del encabezado ya no se usan). Cada uno trae los datos del artículo que necesita
// la línea regalada del pedido (encontrado = false si el artículo no está en la base del equipo).
// Devuelve { promociones, descargado } (descargado = ISO de la última carga; null si nunca).
export async function getPromocionesCliente(cliente, ruta) {
  const db = await getDatabase();
  const [promos, destinos, productos, bonificados, meta] = await Promise.all([
    db.getAllAsync(
      `SELECT p.ID, p.TITULO, p.DESCRIPCION, p.TIPO, p.FECHA_INICIO, p.FECHA_FIN, p.DESTINO
         FROM FR_PROMOCION p
        WHERE p.ACTIVA = 1
        ORDER BY p.FECHA_FIN, p.ID`
    ),
    db.getAllAsync('SELECT PROMOCION_ID, TIPO, VALOR FROM FR_PROMOCION_DESTINO'),
    db.getAllAsync(
      `SELECT pp.ID, pp.PROMOCION_ID, pp.ALCANCE, pp.VALOR, pp.CANTIDAD_MIN, pp.DESCUENTO, pp.PRECIO_ESPECIAL,
              CASE WHEN pp.ALCANCE = 'A'
                   THEN (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = pp.VALOR LIMIT 1) END AS DES_ART
         FROM FR_PROMOCION_PRODUCTO pp
        ORDER BY pp.PROMOCION_ID, pp.ID`
    ),
    // ARTICULO tiene una fila por grupo (COD_ART + GRP_ART): se toma una cualquiera.
    db.getAllAsync(
      `SELECT b.ID, b.PROMOCION_ID, b.ARTICULO, b.CANTIDAD,
              a.COD_ART, a.DES_ART, a.FACTOR_VENTA, a.EMP_ALM, a.EMP_DET, a.CANASTA_BASICA, a.ES_OTRO_CARGO,
              COALESCE(i.IMPUESTO1, 0) AS IMPUESTO1, COALESCE(i.IMPUESTO2, 0) AS IMPUESTO2
         FROM FR_PROMOCION_BONIFICADO b
         LEFT JOIN ARTICULO a ON a.rowid = (SELECT x.rowid FROM ARTICULO x WHERE x.COD_ART = b.ARTICULO LIMIT 1)
         LEFT JOIN IMPUESTO i ON i.IMPUESTO = a.IMPUESTO
        ORDER BY b.PROMOCION_ID, b.ID`
    ),
    db.getFirstAsync("SELECT value FROM app_meta WHERE key = 'sync_promociones_at'"),
  ]);

  const cli = norm(cliente);
  const rut = norm(ruta);
  const aplica = new Set(
    destinos
      .filter(
        (d) =>
          (norm(d.TIPO) === DESTINO.cliente && norm(d.VALOR) === cli) ||
          (norm(d.TIPO) === DESTINO.ruta && norm(d.VALOR) === rut)
      )
      .map((d) => d.PROMOCION_ID)
  );

  const porPromo = new Map();
  for (const p of productos) {
    if (!porPromo.has(p.PROMOCION_ID)) porPromo.set(p.PROMOCION_ID, []);
    porPromo.get(p.PROMOCION_ID).push({
      id: p.ID,
      alcance: norm(p.ALCANCE),
      valor: String(p.VALOR ?? '').trim(),
      descripcion: p.DES_ART ?? null,
      cantidadMin: p.CANTIDAD_MIN ?? 0,
      descuento: p.DESCUENTO,
      precioEspecial: p.PRECIO_ESPECIAL,
    });
  }

  const regalosPorPromo = new Map();
  for (const b of bonificados) {
    if (!regalosPorPromo.has(b.PROMOCION_ID)) regalosPorPromo.set(b.PROMOCION_ID, []);
    regalosPorPromo.get(b.PROMOCION_ID).push({
      id: b.ID,
      articulo: String(b.COD_ART ?? b.ARTICULO ?? '').trim(),
      cantidad: Number(b.CANTIDAD) || 0,
      encontrado: b.COD_ART != null,
      descripcion: b.DES_ART ? String(b.DES_ART).trim() : null,
      factorVenta: b.FACTOR_VENTA > 0 ? b.FACTOR_VENTA : 1,
      empAlm: String(b.EMP_ALM ?? '').trim(),
      empDet: String(b.EMP_DET ?? '').trim(),
      canastaBasica: String(b.CANASTA_BASICA ?? '').trim().toUpperCase() === 'S',
      esOtroCargo: b.ES_OTRO_CARGO ?? null,
      impuesto1: b.IMPUESTO1 ?? 0,
      impuesto2: b.IMPUESTO2 ?? 0,
    });
  }

  const hoy = hoyISO();
  const orden = { [VIGENCIA.vigente]: 0, [VIGENCIA.proximo]: 1, [VIGENCIA.vencido]: 2 };
  const promociones = promos
    .filter((p) => aplica.has(p.ID))
    .map((p) => {
      const promo = {
        id: p.ID,
        titulo: p.TITULO,
        descripcion: p.DESCRIPCION,
        tipo: p.TIPO,
        fechaInicio: p.FECHA_INICIO ?? '',
        fechaFin: p.FECHA_FIN ?? '9999-12-31',
        destino: norm(p.DESTINO),
        productos: porPromo.get(p.ID) ?? [],
        // Solo las tipo 'B' regalan (igual que valida el servidor).
        bonificados: norm(p.TIPO) === TIPO_BONIFICACION ? regalosPorPromo.get(p.ID) ?? [] : [],
      };
      return { ...promo, vigencia: vigenciaDescuento(promo, hoy) };
    })
    .sort((a, b) => orden[a.vigencia] - orden[b.vigencia]);

  return { promociones, descargado: meta?.value ?? null };
}

// ¿El producto de la promoción incluye al artículo? Según ALCANCE:
//   'A' = código igual a VALOR; 'L' = línea (ARTICULO.CLASIFICACION3) igual a VALOR;
//   'T' = la descripción contiene VALOR (sin distinguir mayúsculas).
// articulo: { codigo, descripcion, linea }.
export function productoIncluye(producto, articulo) {
  const v = norm(producto.valor);
  if (!v) return false;
  if (producto.alcance === ALCANCE.articulo) return claveArticulo(articulo.codigo) === v;
  if (producto.alcance === ALCANCE.linea) return norm(articulo.linea) === v;
  if (producto.alcance === ALCANCE.texto) return norm(articulo.descripcion).includes(v);
  return false;
}

// Productos de promociones VIGENTES hoy que incluyen al artículo: [{ promo, producto }].
export function promocionesDeArticulo(promociones, articulo) {
  const r = [];
  for (const promo of promociones) {
    if (promo.vigencia !== VIGENCIA.vigente) continue;
    for (const producto of promo.productos) {
      if (productoIncluye(producto, articulo)) r.push({ promo, producto });
    }
  }
  return r;
}

// % equivalente de un producto de promoción sobre el precio de lista: DESCUENTO (%) o
// PRECIO_ESPECIAL convertido a % (1 − especial / precio). Si trae los dos, el que deje el precio más
// bajo. 0 si no rebaja nada.
export function porcentajePromocion(producto, precio) {
  const desc = Number(producto.descuento) > 0 ? Number(producto.descuento) : 0;
  const especial = Number(producto.precioEspecial);
  const porEspecial = precio > 0 && especial >= 0 && producto.precioEspecial != null ? (1 - especial / precio) * 100 : 0;
  return Math.min(100, Math.max(0, desc, porEspecial));
}

// Mejor promoción para la línea: de las vigentes del artículo, las que cumplen CANTIDAD_MIN (cantidad
// en unidades de almacén) y gana la que deja el precio más bajo. null si ninguna aplica.
// Las de bonificación (TIPO 'B') no entran: la bonificación no cambia el precio de la línea comprada.
// Devuelve { porc, promo, producto }.
export function mejorPromocion(candidatas, cantidad, precio) {
  if (!(cantidad > 0)) return null;
  let mejor = null;
  for (const c of candidatas) {
    if (norm(c.promo.tipo) === TIPO_BONIFICACION) continue;
    if (cantidad < (Number(c.producto.cantidadMin) || 0)) continue;
    const porc = porcentajePromocion(c.producto, precio);
    if (porc > 0 && (!mejor || porc > mejor.porc)) mejor = { ...c, porc };
  }
  return mejor;
}

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

// Bonificaciones que gana UNA línea comprada (proporcional y por producto): por cada promoción tipo
// 'B' vigente que incluye al artículo, veces = floor(cantidad / CANTIDAD_MIN) (cantidad en unidades de
// almacén de la línea del artículo; los productos NO se suman entre sí: 5 de A + 5 de B no llegan a 10).
// Si veces >= 1 se regala CANTIDAD × veces de CADA artículo de FR_PROMOCION_BONIFICADO de la promoción.
// Una sola bonificación por promoción y producto: si varios productos de la misma promoción incluyen
// al artículo (por código y por línea, p. ej.) cuenta el de menor CANTIDAD_MIN. CANTIDAD_MIN vacío o
// en 0 no bonifica. Ejemplo: CANTIDAD_MIN 10, regalos 101 x1 y 16072 x2; llevan 25 -> 2 de 101 y 4 de 16072.
//   candidatas: promocionesDeArticulo(...) del artículo. Devuelve [{ promo, producto, veces, regalos }]
//   (regalos = bonificados de la promoción con cantidad = CANTIDAD × veces).
export function bonificacionesDeLinea(candidatas, cantidad) {
  if (!(cantidad > 0)) return [];
  const porPromo = new Map();
  for (const { promo, producto } of candidatas ?? []) {
    if (norm(promo.tipo) !== TIPO_BONIFICACION || !promo.bonificados?.length) continue;
    const min = Number(producto.cantidadMin) || 0;
    if (!(min > 0)) continue;
    // Tolerancia: almacén + detalle / factor puede dar 9.9999999 en lugar de 10.
    const veces = Math.floor(cantidad / min + 1e-9);
    if (veces < 1) continue;
    const previo = porPromo.get(promo.id);
    if (!previo || veces > previo.veces) porPromo.set(promo.id, { promo, producto, veces });
  }
  return [...porPromo.values()].map((b) => ({
    ...b,
    regalos: b.promo.bonificados.map((r) => ({ ...r, cantidad: r6(r.cantidad * b.veces) })),
  }));
}

// Artículos regalados de TODO el documento, sumados por artículo regalado (así los valida el
// servidor). lineas: las compradas [{ codigo, cantidad }] (ni flete ni regalos).
// candidatasDe(codigo): promociones vigentes del artículo ([{ promo, producto }]).
// Devuelve [{ ...datos del artículo regalado, cantidad, promociones: [títulos] }] en orden de aparición.
export function regalosDocumento(lineas, candidatasDe) {
  const m = new Map();
  for (const l of lineas) {
    for (const b of bonificacionesDeLinea(candidatasDe(l.codigo), l.cantidad)) {
      const titulo = b.promo.titulo || `Promoción ${b.promo.id}`;
      for (const r of b.regalos) {
        const k = claveArticulo(r.articulo);
        const actual = m.get(k) ?? { ...r, cantidad: 0, promociones: [] };
        actual.cantidad = r6(actual.cantidad + r.cantidad);
        if (!actual.promociones.includes(titulo)) actual.promociones.push(titulo);
        m.set(k, actual);
      }
    }
  }
  return [...m.values()];
}
