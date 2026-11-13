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

  // v10: documentos pendientes de cobro del agente (vendedor) del token (/fr/sync/cobrosAgente).
  // Misma estructura que alCXC_PEN_COB, en tabla aparte: alCXC_PEN_COB guarda los de todas las
  // rutas de la handheld y esta solo los que le toca cobrar al usuario (Calendario).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS alCXC_PEN_COB_AGENTE (
        "COD_CIA" TEXT,
        "COD_TIP_DC" TEXT NOT NULL,
        "COD_ZON" TEXT NOT NULL,
        "NUM_DOC" TEXT NOT NULL,
        "COD_CLT" TEXT NOT NULL,
        "FEC_DOC_FT" TEXT NOT NULL,
        "FEC_PRO" TEXT NOT NULL,
        "FEC_VEN" TEXT NOT NULL,
        "IND_MON" TEXT,
        "IND_ANL" TEXT,
        "SALDO_DOLAR" REAL,
        "SALDO_LOCAL" REAL,
        "MONTO_DOLAR" REAL,
        "MONTO_LOCAL" REAL,
        "TIP_CMB_DOL" REAL,
        "CONDICION_PAGO" TEXT,
        "DEV_ANUL" TEXT DEFAULT 'N',
        "SUBTOTAL" REAL,
        "TIP_CMB_LOC" REAL,
        "CLASE_DOCUMENTO" TEXT,
        "INCOTERMS" TEXT,
        "FORMAS_PAGO" TEXT,
        "NATURALEZA_OPERACION" TEXT,
        "CUFE" TEXT,
        "CODIGOQR" TEXT,
        "INDICADOR_FACTURACION" TEXT,
        PRIMARY KEY ("COD_TIP_DC", "COD_ZON", "NUM_DOC", "COD_CLT")
      );
    `);
  },

  // v11: agente (vendedor) dueño de la ruta del documento y su nombre; llegan en /fr/sync/cobros y
  // /fr/sync/cobrosAgente (null si la ruta no tiene asignación activa).
  async (db) => {
    for (const tabla of ['alCXC_PEN_COB', 'alCXC_PEN_COB_AGENTE']) {
      await db.execAsync(`
        ALTER TABLE ${tabla} ADD COLUMN AGENTE TEXT;
        ALTER TABLE ${tabla} ADD COLUMN NOMBRE_AGENTE TEXT;
      `);
    }
  },

  // v12: aprobaciones de cotizaciones (TIP_DOC 'C' -> 'F') hechas en el equipo, pendientes de subir
  // en aprobaciones[] de POST /fr/sync/enviar. FEC_PED = día de aprobación; FEC_DES = entrega elegida.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS COTIZACION_APROBACION (
        "COD_CIA" TEXT,
        "COD_ZON" TEXT NOT NULL,
        "NUM_PED" TEXT NOT NULL,
        "FEC_PED" TEXT NOT NULL,
        "FEC_DES" TEXT,
        "ENVIADO" INTEGER NOT NULL DEFAULT 0,
        "FECHA_ENVIO" TEXT,
        "ERROR_ENVIO" TEXT,
        PRIMARY KEY ("COD_ZON", "NUM_PED")
      );
    `);
  },

  // v13: sin cambios. Una versión de desarrollo (sin publicar) creaba aquí el historial de pedidos;
  // el endpoint pasó a devolver facturas y la v14 borra esas tablas si existen.
  async () => {},

  // v14: caché del historial de FACTURAS del ERP por cliente (/fr/sync/historialPedidos?cliente=),
  // solo consulta. Cada consulta exitosa reemplaza el historial de ESE cliente (COD_CLT). Los montos
  // (TOTAL_MERCADERIA..GRAN_TOTAL) llegan calculados del servidor y no se recalculan.
  // Llave: COD_CIA + NUM_FAC (varias facturas pueden venir del mismo NUM_PED). ANULADA 1 = anulada.
  // ORDEN = posición en que llegó (fecha descendente). Las líneas se leen por COD_CIA + NUM_FAC.
  async (db) => {
    await db.execAsync(`
      DROP TABLE IF EXISTS HISTORIAL_PED_DET;
      DROP TABLE IF EXISTS HISTORIAL_PED_ENC;
      DELETE FROM app_meta WHERE key LIKE 'historial_pedidos_at:%';
      CREATE TABLE IF NOT EXISTS HISTORIAL_FAC_ENC (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "NUM_FAC" TEXT NOT NULL,
        "NUM_PED" TEXT,
        "COD_CLT" TEXT,
        "COD_ZON" TEXT,
        "FEC_FAC" TEXT,
        "MON_FAC" REAL,
        "ANULADA" INTEGER NOT NULL DEFAULT 0,
        "NCF" TEXT,
        "COD_CND" TEXT,
        "DESC1" REAL,
        "DESC2" REAL,
        "MONT_DESC1" REAL,
        "MONT_DESC2" REAL,
        "ACTIVIDAD_COMERCIAL" TEXT,
        "ESTADO_COMPROBANTE" TEXT,
        "TOTAL_MERCADERIA" REAL NOT NULL DEFAULT 0,
        "DESCUENTO_VOLUMEN" REAL NOT NULL DEFAULT 0,
        "SUBTOTAL" REAL NOT NULL DEFAULT 0,
        "IVA" REAL NOT NULL DEFAULT 0,
        "GRAN_TOTAL" REAL NOT NULL DEFAULT 0,
        "ORDEN" INTEGER NOT NULL,
        PRIMARY KEY ("COD_CIA", "NUM_FAC")
      );
      CREATE INDEX IF NOT EXISTS HISTORIAL_FAC_ENC_CLT ON HISTORIAL_FAC_ENC ("COD_CLT", "ORDEN");
      CREATE TABLE IF NOT EXISTS HISTORIAL_FAC_DET (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "NUM_FAC" TEXT NOT NULL,
        "NUM_LN" INTEGER,
        "COD_ART" TEXT,
        "EST_BON" TEXT,
        "CANT_FAC" REAL,
        "CANT_DEV" REAL,
        "PRECIO" REAL,
        "MONT_DESC" REAL,
        "PRC_DESC" REAL,
        "TOTAL_LINEA" REAL
      );
      CREATE INDEX IF NOT EXISTS HISTORIAL_FAC_DET_FAC ON HISTORIAL_FAC_DET ("COD_CIA", "NUM_FAC", "NUM_LN");
    `);
  },

  // v15: caché del historial de PEDIDOS del ERP por cliente (/fr/sync/historialPedidos?cliente=),
  // solo consulta; las facturas van aparte (v14). Cada consulta exitosa reemplaza el historial de
  // ESE cliente. Llave: COD_CIA + NUM_PED. FACTURAS = JSON con los NUM_FAC que salieron del pedido.
  // TIENE_MONTOS 0 = el servidor mandó montos null (todo facturado); los montos son SOLO de las
  // líneas pendientes. HAY_FACTURADAS 1 = alguna línea ya facturada. ORDEN = posición en que llegó.
  // En las líneas facturadas, PRECIO y TOTAL_LINEA vienen de la factura (null si el servidor no
  // pudo determinarlos).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS HISTORIAL_PED_ENC (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "NUM_PED" TEXT NOT NULL,
        "COD_CLT" TEXT,
        "COD_ZON" TEXT,
        "FEC_PED" TEXT,
        "EST_PED" TEXT,
        "MON_PED" REAL,
        "DESC1" REAL,
        "DESC2" REAL,
        "MONT_DESC1" REAL,
        "MONT_DESC2" REAL,
        "ACTIVIDAD_COMERCIAL" TEXT,
        "FACTURAS" TEXT NOT NULL DEFAULT '[]',
        "HAY_FACTURADAS" INTEGER NOT NULL DEFAULT 0,
        "TIENE_MONTOS" INTEGER NOT NULL DEFAULT 0,
        "TOTAL_MERCADERIA" REAL,
        "DESCUENTO_VOLUMEN" REAL,
        "SUBTOTAL" REAL,
        "IVA" REAL,
        "GRAN_TOTAL" REAL,
        "ORDEN" INTEGER NOT NULL,
        PRIMARY KEY ("COD_CIA", "NUM_PED")
      );
      CREATE INDEX IF NOT EXISTS HISTORIAL_PED_ENC_CLT ON HISTORIAL_PED_ENC ("COD_CLT", "ORDEN");
      CREATE TABLE IF NOT EXISTS HISTORIAL_PED_DET (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "NUM_PED" TEXT NOT NULL,
        "NUM_LN" INTEGER,
        "COD_ART" TEXT,
        "EST_BON" TEXT,
        "EST_LN" TEXT,
        "FACTURADA" INTEGER NOT NULL DEFAULT 0,
        "CANTIDAD" REAL,
        "PRECIO" REAL,
        "MONT_DESC" REAL,
        "PRC_DESC" REAL,
        "TOTAL_LINEA" REAL
      );
      CREATE INDEX IF NOT EXISTS HISTORIAL_PED_DET_PED ON HISTORIAL_PED_DET ("COD_CIA", "NUM_PED", "NUM_LN");
    `);
  },

  // v16: vendedor (agente) de cada factura del historial, para la columna Vendedor de
  // Menú Consultar > Documentos. Llegan en el encabezado de /fr/sync/historialFacturas(Ruta);
  // null si el servidor no los manda.
  async (db) => {
    await db.execAsync(`
      ALTER TABLE HISTORIAL_FAC_ENC ADD COLUMN AGENTE TEXT;
      ALTER TABLE HISTORIAL_FAC_ENC ADD COLUMN NOMBRE_AGENTE TEXT;
    `);
  },

  // v17: pagos (abonos) a documentos pendientes de cobro, registrados en el equipo
  // (Cobros > Documentos a cobrar > Pagar). Un pago puede combinar varias formas (pago híbrido):
  // COBRO_PAGO = encabezado (documento, moneda del cobro y monto total) y COBRO_PAGO_DET = una fila
  // por forma de pago (CHEQUE | EFECTIVO | TRANSFERENCIA | DEPOSITO).
  // MONEDA: 'L' local | 'D' dólar. Mientras ENVIADO = 0 el monto se descuenta del saldo del documento.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS COBRO_PAGO (
        "ID" INTEGER PRIMARY KEY AUTOINCREMENT,
        "COD_CLT" TEXT NOT NULL,
        "COD_ZON" TEXT NOT NULL,
        "COD_TIP_DC" TEXT NOT NULL,
        "NUM_DOC" TEXT NOT NULL,
        "MONEDA" TEXT NOT NULL,
        "FECHA" TEXT NOT NULL,
        "MONTO" REAL NOT NULL,
        "SALDO_ANTERIOR" REAL,
        "SALDO_NUEVO" REAL,
        "ENVIADO" INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS COBRO_PAGO_DOC ON COBRO_PAGO ("COD_CLT", "COD_ZON", "COD_TIP_DC", "NUM_DOC");
      CREATE TABLE IF NOT EXISTS COBRO_PAGO_DET (
        "ID_PAGO" INTEGER NOT NULL REFERENCES COBRO_PAGO ("ID") ON DELETE CASCADE,
        "LINEA" INTEGER NOT NULL,
        "FORMA" TEXT NOT NULL,
        "MONTO" REAL NOT NULL,
        "NUM_CHEQUE" TEXT,
        "NUM_CUENTA" TEXT,
        "FECHA_CHEQUE" TEXT,
        "NUM_TRANSACCION" TEXT,
        PRIMARY KEY ("ID_PAGO", "LINEA")
      );
    `);
  },

  // v18: cuentas bancarias (GET /fr/sync/cuentasBanco). En el servidor la llave de alCXC_CTA_BCO es
  // COD_CIA + COD_BCO + CTA_BCO; la tabla local (del esquema de Exactus) no tenía COD_CIA en la llave,
  // así que la misma cuenta en dos compañías se pisaba: se vuelve a crear con la llave del servidor.
  // El pago guarda la compañía del documento y, en transferencias/depósitos, la cuenta elegida
  // (COD_CIA + COD_BCO + NUM_CUENTA), que es lo que pide el encabezado del depósito (alCXC_ENC_DEP).
  async (db) => {
    await db.execAsync(`
      DROP TABLE IF EXISTS alCXC_CTA_BCO;
      CREATE TABLE alCXC_CTA_BCO (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "COD_BCO" TEXT NOT NULL,
        "CTA_BCO" TEXT NOT NULL,
        "NOM_CTA" TEXT,
        "MONEDA" TEXT,
        PRIMARY KEY ("COD_CIA", "COD_BCO", "CTA_BCO")
      );
      ALTER TABLE COBRO_PAGO ADD COLUMN COD_CIA TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN COD_CIA TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN COD_BCO TEXT;
    `);
  },

  // v19: depósitos (POST /fr/sync/enviar -> depositos -> alCXC_ENC_DEP + alCXC_DET_DEP).
  // - alCXC_ENC_DEP se vuelve a crear: NUM_DEP (boleta) como TEXTO (en REAL se perdían dígitos),
  //   llave del servidor (COD_CIA + COD_BCO + CTA_BCO + NUM_DEP) y control de envío.
  //   ORIGEN: 'PAGO' = transferencia/depósito del cliente (nace al registrar el pago);
  //           'DEPOSITO' = el vendedor deposita efectivo y cheques cobrados (Datos > Depósitos).
  // - COBRO_PAGO_DET.DEP_*: depósito al que pertenece cada forma de pago. Las líneas de alCXC_DET_DEP
  //   se arman al enviar, sumando por documento (NUM_DOC no se repite dentro de un depósito).
  // - COBRO_PAGO.SALDO_SERVIDOR: saldo del documento en el servidor al registrar el abono (moneda del
  //   abono). El abono se sigue descontando hasta que el saldo del servidor baje (lo aplicó control en el ERP).
  async (db) => {
    await db.execAsync(`
      DROP TABLE IF EXISTS alCXC_ENC_DEP;
      CREATE TABLE alCXC_ENC_DEP (
        "COD_CIA" TEXT NOT NULL DEFAULT '',
        "COD_BCO" TEXT NOT NULL,
        "CTA_BCO" TEXT NOT NULL,
        "NUM_DEP" TEXT NOT NULL,
        "FEC_DEP" TEXT NOT NULL,
        "IND_MON" TEXT NOT NULL,
        "NOTAS" TEXT,
        "ORIGEN" TEXT NOT NULL,
        "ENVIADO" INTEGER NOT NULL DEFAULT 0,
        "FECHA_ENVIO" TEXT,
        "ERROR_ENVIO" TEXT,
        "CONSEC_DEP" INTEGER,
        PRIMARY KEY ("COD_CIA", "COD_BCO", "CTA_BCO", "NUM_DEP")
      );
      ALTER TABLE COBRO_PAGO ADD COLUMN SALDO_SERVIDOR REAL;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN DEP_CIA TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN DEP_BCO TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN DEP_CTA TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN DEP_NUM TEXT;
      CREATE INDEX IF NOT EXISTS COBRO_PAGO_DET_DEP ON COBRO_PAGO_DET ("DEP_CTA", "DEP_NUM");
    `);
  },

  // v20: recibos. Cada pago a un documento es un recibo; su número sale de RUTA_CONSECUT_RT.RECIBO
  // de la ruta y es el NUM_DEP de alCXC_ENC_DEP / alCXC_DET_DEP (una cuenta de banco por recibo).
  // COBRO_PAGO.NUM_REC = número del recibo. COBRO_PAGO_DET.BANCO_CHEQUE = banco del cheque del
  // cliente (texto libre, para el recibo y REF).
  async (db) => {
    await db.execAsync(`
      ALTER TABLE COBRO_PAGO ADD COLUMN NUM_REC TEXT;
      ALTER TABLE COBRO_PAGO_DET ADD COLUMN BANCO_CHEQUE TEXT;
    `);
  },

  // v21: pagos con recibo pero NUM_REC vacío: se rellena con el NUM_DEP de su recibo (alCXC_ENC_DEP
  // con ORIGEN 'RECIBO'), que es el mismo correlativo (RERT_<ruta>_<n>).
  async (db) => {
    await db.execAsync(`
      UPDATE COBRO_PAGO
         SET NUM_REC = (
           SELECT e.NUM_DEP FROM COBRO_PAGO_DET d
             JOIN alCXC_ENC_DEP e
               ON e.COD_CIA = d.DEP_CIA AND e.COD_BCO = d.DEP_BCO AND e.CTA_BCO = d.DEP_CTA AND e.NUM_DEP = d.DEP_NUM
            WHERE d.ID_PAGO = COBRO_PAGO.ID AND e.ORIGEN = 'RECIBO'
            LIMIT 1)
       WHERE COALESCE(NUM_REC, '') = '';
    `);
  },

  // v22: DOC_PRO del recibo (GET /fr/sync/recibosPendientes): 'N' = pendiente, control aún no lo
  // aplica en el ERP (se sigue descontando del saldo); 'S' = aplicado. Los recibos del equipo arrancan 'N'.
  async (db) => {
    await db.execAsync(`
      ALTER TABLE alCXC_ENC_DEP ADD COLUMN DOC_PRO TEXT;
      UPDATE alCXC_ENC_DEP SET DOC_PRO = 'N' WHERE ORIGEN = 'RECIBO';
    `);
  },

  // v23: metas de venta por artículo del agente del token (GET /fr/sync/metas). Una meta por
  // ANIO + MES + VENDEDOR + COD_ART. Volver a subir el Excel en la web reemplaza el periodo y cambia
  // los ID_META: la sync borra el periodo completo y lo vuelve a insertar (no upsert por ID_META).
  // VENTA_UNIDADES / VENTA_VALOR hoy llegan null (reservados); lo vendido se calcula en el equipo.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS META_VENTA (
        ID_META            INTEGER PRIMARY KEY,
        ANIO               INTEGER NOT NULL,
        MES                INTEGER NOT NULL,
        VENDEDOR           TEXT    NOT NULL,
        COD_LINEA          TEXT,
        LINEA              TEXT,
        COD_LIDER          TEXT,
        LIDER              TEXT,
        COD_ART            TEXT    NOT NULL,
        DES_ART            TEXT,
        COD_PROVEEDOR      TEXT,
        PROVEEDOR          TEXT,
        META_UNIDADES      REAL    NOT NULL DEFAULT 0,
        MINIMO             REAL    NOT NULL DEFAULT 0,
        INCENTIVO          REAL    NOT NULL DEFAULT 0,
        VENTA_UNIDADES     REAL,
        VENTA_VALOR        REAL,
        FECHA_MODIFICACION TEXT,
        UNIQUE (ANIO, MES, VENDEDOR, COD_ART)
      );
      CREATE INDEX IF NOT EXISTS IX_META_VENTA_PERIODO ON META_VENTA (ANIO, MES);
    `);
  },

  // v24: descuentos por cliente y artículo (erpadmin.DESCUENTO_CLIART, GET /fr/sync/descuentos) para
  // pedidos y cotizaciones. La tabla del esquema de Exactus (v2) nunca se llenó: se vuelve a crear con
  // las columnas en el mismo orden que el servidor y COMPANIA en la llave (el mismo descuento en dos
  // compañías no se pisa). TIPO: tipo de descuento del ERP (ej. 'P' = porcentaje); MONTO según TIPO.
  // FECHA_INICIO / FECHA_FIN como 'YYYY-MM-DD'.
  async (db) => {
    await db.execAsync(`
      DROP TABLE IF EXISTS DESCUENTO_CLIART;
      CREATE TABLE DESCUENTO_CLIART (
        "COMPANIA" TEXT NOT NULL DEFAULT '',
        "ARTICULO" TEXT NOT NULL,
        "CLIENTE" TEXT NOT NULL,
        "CANT_MIN" REAL NOT NULL,
        "CANT_MAX" REAL NOT NULL,
        "FECHA_INICIO" TEXT NOT NULL,
        "FECHA_FIN" TEXT NOT NULL,
        "TIPO" TEXT NOT NULL,
        "MONTO" REAL NOT NULL,
        PRIMARY KEY ("COMPANIA", "ARTICULO", "CLIENTE", "CANT_MIN", "CANT_MAX", "FECHA_INICIO", "FECHA_FIN")
      );
      CREATE INDEX IF NOT EXISTS IX_DESCUENTO_CLIART_CLT_ART ON DESCUENTO_CLIART ("CLIENTE", "ARTICULO");
    `);
  },

  // v25: promociones de la web (erpadmin.FR_PROMOCION, FR_PROMOCION_DESTINO y FR_PROMOCION_PRODUCTO;
  // GET /fr/sync/promociones, /promocionesDestinos y /promocionesProductos). Mismos campos y nombres
  // que en el servidor; se unen por PROMOCION_ID y se reemplazan completas en cada Cargar datos.
  // - FR_PROMOCION: ACTIVA 1 = activa, 0 = inactiva. FECHA_INICIO / FECHA_FIN como 'YYYY-MM-DD'.
  //   ARTICULO_BONIFICADO / CANTIDAD_BONIFICADA: bonificación (va aparte de los descuentos).
  // - FR_PROMOCION_DESTINO: a quién aplica la promoción (TIPO + VALOR).
  // - FR_PROMOCION_PRODUCTO: a qué artículos aplica, según ALCANCE:
  //     'A' = código del artículo igual a VALOR; 'L' = línea (ARTICULO.CLASIFICACION3) igual a VALOR;
  //     'T' = DES_ART contiene VALOR (sin distinguir mayúsculas).
  //   DESCUENTO (%) o PRECIO_ESPECIAL desde CANTIDAD_MIN. Gana el precio más bajo entre descuentos,
  //   precios especiales y DESCUENTO_CLIART (no se suman).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS FR_PROMOCION (
        "ID" INTEGER PRIMARY KEY NOT NULL,
        "TITULO" TEXT,
        "DESCRIPCION" TEXT,
        "TIPO" TEXT,
        "FECHA_INICIO" TEXT,
        "FECHA_FIN" TEXT,
        "DESTINO" TEXT,
        "ARTICULO_BONIFICADO" TEXT,
        "CANTIDAD_BONIFICADA" REAL,
        "ACTIVA" INTEGER NOT NULL DEFAULT 1,
        "CREADO_POR" TEXT,
        "FECHA_CREACION" TEXT,
        "MODIFICADO_POR" TEXT,
        "FECHA_MODIFICACION" TEXT
      );
      CREATE TABLE IF NOT EXISTS FR_PROMOCION_DESTINO (
        "PROMOCION_ID" INTEGER NOT NULL,
        "TIPO" TEXT NOT NULL,
        "VALOR" TEXT NOT NULL DEFAULT '',
        PRIMARY KEY ("PROMOCION_ID", "TIPO", "VALOR")
      );
      CREATE TABLE IF NOT EXISTS FR_PROMOCION_PRODUCTO (
        "ID" INTEGER PRIMARY KEY NOT NULL,
        "PROMOCION_ID" INTEGER NOT NULL,
        "ALCANCE" TEXT NOT NULL,
        "VALOR" TEXT NOT NULL,
        "CANTIDAD_MIN" REAL,
        "DESCUENTO" REAL,
        "PRECIO_ESPECIAL" REAL
      );
      CREATE INDEX IF NOT EXISTS IX_FR_PROMOCION_PRODUCTO_PROMO ON FR_PROMOCION_PRODUCTO ("PROMOCION_ID");
    `);
  },

  // v26: solicitudes de promocionales (Validar > Promocionales). Las del servidor llegan con
  // GET /fr/sync/promocionales (ENVIADO = 1); las que se registren en el equipo quedan con ENVIADO = 0
  // hasta subirlas. DOC_PRO 'N' = pendiente, 'S' = procesada (FECHA_PROCESADO).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS PROMOCIONAL (
        "CLIENTE" TEXT NOT NULL,
        "FECHA_SOLICITUD" TEXT NOT NULL,
        "ID" INTEGER,
        "RUTA" TEXT NOT NULL,
        "NOM_CLT" TEXT,
        "AGENTE" TEXT,
        "NOTAS" TEXT NOT NULL,
        "FECHA_REQUERIDA" TEXT NOT NULL,
        "DOC_PRO" TEXT NOT NULL DEFAULT 'N',
        "FECHA_PROCESADO" TEXT,
        "ENVIADO" INTEGER NOT NULL DEFAULT 0,
        "FECHA_ENVIO" TEXT,
        "ERROR_ENVIO" TEXT,
        PRIMARY KEY ("CLIENTE", "FECHA_SOLICITUD")
      );
    `);
  },

  // v27: bitácora de actividad del equipo para el reporte Mi día (Reportes > Visitas). Se anota al
  // registrar cada pedido, cotización, aprobación, cobro y promocional; "Cargar datos" NO la toca (sí
  // borra los pedidos y aprobaciones ya enviados), así el reporte del día no pierde nada.
  // TIPO: PEDIDO | COTIZACION | APROBACION | COBRO | PROMOCIONAL. CLAVE: identifica el registro dentro
  // del tipo (para no duplicar y para quitarlo si se elimina). FECHA = día 'YYYY-MM-DD'; HORA =
  // 'YYYY-MM-DD HH:MM:SS'. DETALLE: JSON con datos extra (recibo, formas de pago, notas...).
  // Se carga con lo que ya hay en el equipo (pedidos sin enviar, aprobaciones, cobros, promocionales).
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS REPORTE_ACTIVIDAD (
        "TIPO" TEXT NOT NULL,
        "CLAVE" TEXT NOT NULL,
        "FECHA" TEXT NOT NULL,
        "HORA" TEXT NOT NULL,
        "CLIENTE" TEXT,
        "NOM_CLT" TEXT,
        "RUTA" TEXT,
        "DOCUMENTO" TEXT,
        "MONTO" REAL,
        "DETALLE" TEXT,
        PRIMARY KEY ("TIPO", "CLAVE")
      );
      CREATE INDEX IF NOT EXISTS IX_REPORTE_ACTIVIDAD_FECHA ON REPORTE_ACTIVIDAD ("FECHA");

      INSERT OR IGNORE INTO REPORTE_ACTIVIDAD (TIPO, CLAVE, FECHA, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE)
      SELECT CASE WHEN e.TIP_DOC = 'C' THEN 'COTIZACION' ELSE 'PEDIDO' END,
             e.COD_ZON || '|' || e.NUM_PED, substr(COALESCE(e.HOR_FIN, e.FEC_PED), 1, 10),
             COALESCE(e.HOR_FIN, e.FEC_PED), e.COD_CLT,
             (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(e.COD_CLT)),
             e.COD_ZON, e.NUM_PED, e.MON_CIV, NULL
        FROM alFAC_ENC_PED e
       WHERE e.ENVIADO = 0
          OR (e.TIP_DOC = 'F' AND NOT EXISTS (SELECT 1 FROM COTIZACION_APROBACION a
                                                WHERE a.COD_ZON = e.COD_ZON AND a.NUM_PED = e.NUM_PED));

      INSERT OR IGNORE INTO REPORTE_ACTIVIDAD (TIPO, CLAVE, FECHA, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE)
      SELECT 'APROBACION', a.COD_ZON || '|' || a.NUM_PED, substr(a.FEC_PED, 1, 10), a.FEC_PED, e.COD_CLT,
             (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(e.COD_CLT)),
             a.COD_ZON, a.NUM_PED, e.MON_CIV, NULL
        FROM COTIZACION_APROBACION a
        LEFT JOIN alFAC_ENC_PED e ON e.COD_ZON = a.COD_ZON AND e.NUM_PED = a.NUM_PED;

      INSERT OR IGNORE INTO REPORTE_ACTIVIDAD (TIPO, CLAVE, FECHA, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE)
      SELECT 'COBRO', CAST(p.ID AS TEXT), substr(p.FECHA, 1, 10), p.FECHA, p.COD_CLT,
             (SELECT MIN(c.NOM_CLT) FROM CLIENTE c WHERE TRIM(c.COD_CLT) = TRIM(p.COD_CLT)),
             p.COD_ZON, p.NUM_DOC, p.MONTO,
             json_object('recibo', p.NUM_REC, 'moneda', p.MONEDA, 'cancelado', CASE WHEN p.SALDO_NUEVO <= 0.005 THEN 1 ELSE 0 END)
        FROM COBRO_PAGO p;

      INSERT OR IGNORE INTO REPORTE_ACTIVIDAD (TIPO, CLAVE, FECHA, HORA, CLIENTE, NOM_CLT, RUTA, DOCUMENTO, MONTO, DETALLE)
      SELECT 'PROMOCIONAL', p.CLIENTE || '|' || p.FECHA_SOLICITUD, substr(p.FECHA_SOLICITUD, 1, 10), p.FECHA_SOLICITUD,
             p.CLIENTE, p.NOM_CLT, p.RUTA, NULL, NULL, json_object('notas', p.NOTAS, 'requerida', p.FECHA_REQUERIDA)
        FROM PROMOCIONAL p
       WHERE p.ENVIADO = 0;
    `);
  },
];
