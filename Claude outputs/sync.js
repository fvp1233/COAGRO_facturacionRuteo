// controllers/fr/sync.js  (copiar a tu backend)
//
// Endpoint de sincronización para la handheld. Devuelve, en UNA sola respuesta, los datos
// ya con la forma de las tablas locales de la app (SQLite), para que el teléfono solo
// tenga que guardarlos y no tenga que unir varios endpoints de mantenimiento.
//
// GET /fr/sync/clientes            -> todas las rutas
// GET /fr/sync/clientes?ruta=001   -> solo esa ruta (varias: ?ruta=001,002)
//
// Respuesta:
// {
//   success: true,
//   errors: [],
//   result: {
//     rutas:       [{ RUTA, DESCRIPCION, ACTIVA, PERIODICIDAD }],        -> RUTA_RT
//     clientes:    [{ COD_ZON, COD_CLT, FEC_PLN, NOM_CLT, DIR_CLT,
//                     DESGLOSE, TIPO_IMPUESTO, TIPO_TARIFA, PORC_TARIFA }], -> CLIENTE
//     rutaOrden:   [{ RUTA, CLIENTE, DIA, ORDEN }],                      -> alFAC_RUTA_ORDEN
//     ubicaciones: [{ RUTA, CLIENTE, LATITUD, LONGITUD, ALTITUD }]       -> CLIENTE_UBICACION
//   }
// }
//
// Notas:
//  - "CLIENTE" de rutaOrden/ubicaciones es el CODIGO de CLIENTE_ASOC_RT (el código de la handheld),
//    igual que COD_CLT en la tabla de clientes.
//  - Los clientes salen de CLIENTE_ASOC_RT (CODIGO -> CLIENTE -> CLIENTE_RT.NOMBRE); la direccion
//    y datos de handheld se completan desde erpadmin.cliente (unico lugar donde existen).
//  - Las consultas con ruta usan parámetros (replacements), no concatenan texto en el SQL.

const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../config/mssql");
const {
  rutaRtModel,
  rutaClienteModel,
  clienteAsocRtModel,
  clienteRtModel,
} = require("../../models");

// SQL Server limita los parametros por consulta (~2100): las listas largas se consultan por lotes.
const porLotes = async (lista, consulta, tamano = 500) => {
  const salida = [];
  for (let i = 0; i < lista.length; i += tamano) {
    salida.push(...(await consulta(lista.slice(i, i + tamano))));
  }
  return salida;
};

const getSyncClientes = async (req, res) => {
  try {
    const rutasFiltro = req.query.ruta
      ? String(req.query.ruta)
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : null;
    const whereRuta = rutasFiltro && rutasFiltro.length ? { RUTA: rutasFiltro } : {};

    // 1) Rutas (nombre/descripcion para la pantalla)
    const rutasRaw = await rutaRtModel.findAll({
      where: whereRuta,
      order: [["RUTA", "ASC"]],
      raw: true,
    });
    const rutas = rutasRaw.map((r) => ({
      RUTA: r.RUTA,
      DESCRIPCION: r.DESCRIPCION ?? null,
      ACTIVA: r.ACTIVA ?? null,
      PERIODICIDAD: r.PERIODICIDAD ?? null,
    }));

    // 2) Asignacion ruta-cliente-dia-orden
    const rutaOrden = await rutaClienteModel.findAll({
      where: whereRuta,
      order: [
        ["RUTA", "ASC"],
        ["DIA", "ASC"],
        ["ORDEN", "ASC"],
      ],
      raw: true,
    });

    // 3) Clientes. La fuente es CLIENTE_ASOC_RT (el codigo de la handheld = CODIGO):
    //      rutaCliente.CLIENTE -> CLIENTE_ASOC_RT.CODIGO -> CLIENTE_ASOC_RT.CLIENTE -> CLIENTE_RT
    //    El nombre sale de CLIENTE_RT.NOMBRE (el que tu sistema edita). La direccion y los
    //    demas datos "de handheld" solo existen en erpadmin.cliente, por eso se leen de ahi
    //    (LEFT: si no hay fila, el cliente igual sale, con direccion vacia).
    //    Se genera una fila por cada (ruta, cliente) asignado, como la tabla CLIENTE de la handheld.
    const asignados = [...new Set(rutaOrden.map((r) => String(r.CLIENTE).trim()))];
    const asoc = await porLotes(asignados, (lote) =>
      clienteAsocRtModel.findAll({ where: { CODIGO: lote }, raw: true })
    );
    const asocDeCodigo = new Map(asoc.map((a) => [String(a.CODIGO).trim(), a]));
    const codigosErp = [...new Set(asoc.map((a) => String(a.CLIENTE).trim()))];

    const rtRows = await porLotes(codigosErp, (lote) =>
      clienteRtModel.findAll({ where: { CLIENTE: lote }, raw: true })
    );
    const rtDeCliente = new Map(rtRows.map((c) => [String(c.CLIENTE).trim(), c]));

    const erpRows = await porLotes(codigosErp, (lote) =>
      sequelize.query(
        `SELECT COD_CLT, NOM_CLT, DIR_CLT, FEC_PLN, DESGLOSE, TIPO_IMPUESTO, TIPO_TARIFA, PORC_TARIFA
           FROM COAGRO2.erpadmin.cliente
          WHERE COD_CLT IN (:lote)`,
        { replacements: { lote }, type: QueryTypes.SELECT }
      )
    );
    const erpDeCliente = new Map();
    for (const e of erpRows) {
      const k = String(e.COD_CLT).trim();
      if (!erpDeCliente.has(k)) erpDeCliente.set(k, e);
    }

    const vistos = new Set();
    const clientes = [];
    for (const ro of rutaOrden) {
      const codigo = String(ro.CLIENTE).trim();
      const ruta = String(ro.RUTA).trim();
      const a = asocDeCodigo.get(codigo);
      if (!a) continue; // asignado a una ruta pero sin asociacion: no es un cliente valido
      const clave = `${ruta}|${codigo}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const rt = rtDeCliente.get(String(a.CLIENTE).trim());
      const erp = erpDeCliente.get(String(a.CLIENTE).trim());
      clientes.push({
        COD_ZON: ruta,
        COD_CLT: codigo,
        NOM_CLT: rt?.NOMBRE ?? erp?.NOM_CLT ?? "",
        DIR_CLT: erp?.DIR_CLT ?? "",
        FEC_PLN: erp?.FEC_PLN ?? null,
        DESGLOSE: erp?.DESGLOSE ?? null,
        TIPO_IMPUESTO: erp?.TIPO_IMPUESTO ?? null,
        TIPO_TARIFA: erp?.TIPO_TARIFA ?? null,
        PORC_TARIFA: erp?.PORC_TARIFA ?? null,
      });
    }

    // 4) Ubicaciones: CLIENTE_RT guarda las coordenadas por codigo de ERP; se llevan al
    //    codigo de la handheld (CODIGO de CLIENTE_ASOC_RT) y se repiten por ruta.
    const ubicaciones = [];
    for (const ro of rutaOrden) {
      const a = asocDeCodigo.get(String(ro.CLIENTE).trim());
      const c = a && rtDeCliente.get(String(a.CLIENTE).trim());
      if (!c) continue;
      if (c.LATITUD == null && c.LONGITUD == null && c.ALTITUD == null) continue;
      ubicaciones.push({
        RUTA: ro.RUTA,
        CLIENTE: ro.CLIENTE,
        LATITUD: c.LATITUD,
        LONGITUD: c.LONGITUD,
        ALTITUD: c.ALTITUD,
      });
    }

    res.send({
      result: { rutas, clientes, rutaOrden, ubicaciones },
      success: true,
      errors: [],
    });
  } catch (error) {
    console.log(error);
    res.send({
      result: {},
      success: false,
      errors: ["Error al preparar la sincronizacion de clientes"],
    });
  }
};

module.exports = { getSyncClientes };
