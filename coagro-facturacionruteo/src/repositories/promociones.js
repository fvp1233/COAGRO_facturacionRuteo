import { getDatabase } from '../db/database';
import { claveArticulo, hoyISO, vigenciaDescuento, VIGENCIA } from './descuentos';

// Promociones de la web (FR_PROMOCION + FR_PROMOCION_DESTINO + FR_PROMOCION_PRODUCTO), unidas por
// PROMOCION_ID. Se descargan en Datos > Cargar datos.

// FR_PROMOCION_DESTINO.TIPO: a quién aplica la promoción (VALOR = código del cliente o de la ruta).
export const DESTINO = { cliente: 'C', ruta: 'R' };
// FR_PROMOCION_PRODUCTO.ALCANCE: cómo se buscan los artículos de la promoción.
export const ALCANCE = { articulo: 'A', linea: 'L', texto: 'T' };

const norm = (v) => String(v ?? '').trim().toUpperCase();

// Promociones ACTIVAS que aplican al cliente: algún destino es el cliente (TIPO 'C') o su ruta
// (TIPO 'R'). Cada una trae su vigencia respecto a hoy y sus productos (con la descripción del
// artículo cuando el alcance es 'A'). Primero las vigentes, luego las próximas y al final las vencidas.
// Devuelve { promociones, descargado } (descargado = ISO de la última carga; null si nunca).
export async function getPromocionesCliente(cliente, ruta) {
  const db = await getDatabase();
  const [promos, destinos, productos, meta] = await Promise.all([
    db.getAllAsync(
      `SELECT p.ID, p.TITULO, p.DESCRIPCION, p.TIPO, p.FECHA_INICIO, p.FECHA_FIN, p.DESTINO,
              p.ARTICULO_BONIFICADO, p.CANTIDAD_BONIFICADA,
              (SELECT a.DES_ART FROM ARTICULO a WHERE a.COD_ART = p.ARTICULO_BONIFICADO LIMIT 1) AS DES_BONIFICADO
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
        articuloBonificado: p.ARTICULO_BONIFICADO,
        bonificadoDescripcion: p.DES_BONIFICADO ?? null,
        cantidadBonificada: p.CANTIDAD_BONIFICADA,
        productos: porPromo.get(p.ID) ?? [],
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
// Devuelve { porc, promo, producto }.
export function mejorPromocion(candidatas, cantidad, precio) {
  if (!(cantidad > 0)) return null;
  let mejor = null;
  for (const c of candidatas) {
    if (cantidad < (Number(c.producto.cantidadMin) || 0)) continue;
    const porc = porcentajePromocion(c.producto, precio);
    if (porc > 0 && (!mejor || porc > mejor.porc)) mejor = { ...c, porc };
  }
  return mejor;
}
