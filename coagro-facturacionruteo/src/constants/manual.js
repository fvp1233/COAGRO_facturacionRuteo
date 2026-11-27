// Contenido del Manual de usuario (Parámetros > Manual de usuario).
// Cada sección: { id, titulo, icono (Feather), resumen, bloques }. Tipos de bloque:
//   { tipo: 'texto', texto }            párrafo
//   { tipo: 'subtitulo', texto }        título dentro de la sección
//   { tipo: 'pasos', items: [] }        lista numerada (cómo hacer algo)
//   { tipo: 'lista', items: [] }        lista con viñetas
//   { tipo: 'nota', texto }             recuadro de consejo o advertencia
// Para cambiar el manual basta con editar este archivo.

export const MANUAL = [
  {
    id: 'inicio',
    titulo: 'Primeros pasos',
    icono: 'play-circle',
    resumen: 'Primer uso, inicio de sesión, ruta activa y menú principal.',
    bloques: [
      { tipo: 'subtitulo', texto: 'Primer uso del equipo' },
      {
        tipo: 'texto',
        texto:
          'La primera vez que abres la app en un equipo nuevo aparece la pantalla de conexión. Necesitas internet para este paso.',
      },
      {
        tipo: 'lista',
        items: [
          'Ya tengo cuenta: escribe tu usuario y contraseña. Si el servidor los acepta, el equipo queda configurado y pasas al inicio de sesión.',
          'Registrarme: crea tu usuario. Queda pendiente hasta que un administrador lo apruebe en la web; después entra con "Ya tengo cuenta".',
        ],
      },
      { tipo: 'subtitulo', texto: 'Iniciar sesión' },
      {
        tipo: 'texto',
        texto:
          'Escribe tu usuario y contraseña. Después del primer uso el inicio de sesión funciona SIN internet, así que puedes trabajar en ruta aunque no tengas señal.',
      },
      {
        tipo: 'nota',
        texto:
          'Deja marcada "Mantener sesión iniciada" y la próxima vez que abras la app entrarás directo, sin escribir tu usuario. La sesión se guarda cifrada en el teléfono y solo se vuelve a pedir si pasas 30 días sin abrir la app o si tocas "Cerrar sesión". En un teléfono compartido, desmárcala.',
      },
      { tipo: 'subtitulo', texto: 'Ruta activa' },
      {
        tipo: 'texto',
        texto:
          'Si tu equipo tiene varias rutas, la ruta activa decide qué artículos, bodega e inventario se usan en los pedidos. Para cambiarla, toca el menú de la esquina superior del inicio y elige "Cambiar ruta".',
      },
      { tipo: 'subtitulo', texto: 'Menú principal' },
      {
        tipo: 'lista',
        items: [
          'Clientes: visitar clientes, hacer pedidos, cotizaciones, cobros y notas de crédito.',
          'Metas: cómo vas con tus metas de venta del mes.',
          'Reportes: lo vendido y cobrado del día, cierre de cobro, visitas e inventario.',
          'Datos: cargar la información del sistema y enviar lo que registraste.',
          'Parámetros: consecutivos, datos del dispositivo y este manual.',
          'Calendario: vencimientos de los documentos por cobrar.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Para salir, usa "Cerrar sesión" en el menú de la esquina superior del inicio. Lo que registraste no se pierde: queda guardado en el equipo. Al cerrar sesión, la próxima vez la app te pedirá usuario y contraseña.',
      },
    ],
  },
  {
    id: 'datos',
    titulo: 'Cargar y enviar datos',
    icono: 'refresh-cw',
    resumen: 'Cómo traer la información del sistema y subir lo que registraste.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'La app trabaja sin conexión con la información guardada en el equipo. En el módulo Datos la actualizas y subes lo que hiciste.',
      },
      { tipo: 'subtitulo', texto: 'Cargar datos (al iniciar el día)' },
      {
        tipo: 'pasos',
        items: [
          'Conéctate a internet.',
          'Entra a Datos y toca "Cargar datos".',
          'Espera a que termine. Al final verás un resumen con lo que se descargó: clientes, artículos, precios, documentos por cobrar, historial, descuentos, promociones, metas y más.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Cargar datos primero envía lo que tengas pendiente. Solo si todo se envió reemplaza la información del equipo, así nunca se pierde lo que registraste. Si la red se corta a medias, el equipo queda como estaba.',
      },
      { tipo: 'subtitulo', texto: 'Enviar datos (durante y al final del día)' },
      {
        tipo: 'pasos',
        items: [
          'Conéctate a internet.',
          'Entra a Datos y toca "Enviar datos".',
          'Revisa el resultado. Si algún registro fue rechazado, aparece con el motivo; los demás se envían igual.',
        ],
      },
      {
        tipo: 'lista',
        items: [
          'Se envían: pedidos, cotizaciones y sus aprobaciones, visitas, ubicaciones de clientes, cobros (recibos), notas de crédito, solicitudes de promocionales, cambios a la ficha del cliente y consecutivos.',
          '"Pendientes de enviar" en la pantalla Datos te dice cuántos registros faltan por subir.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Si una lista sale vacía o falta un catálogo (estados de visita, consecutivos, departamentos, etc.), casi siempre se resuelve con Datos > Cargar datos.',
      },
    ],
  },
  {
    id: 'clientes',
    titulo: 'Buscar y validar un cliente',
    icono: 'users',
    resumen: 'Encontrar al cliente y abrir sus opciones.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'Todo lo que haces con un cliente empieza en Clientes. "Validar" abre las opciones del cliente y empieza a contar el tiempo de la visita.',
      },
      {
        tipo: 'pasos',
        items: [
          'Entra a Clientes.',
          'Elige la Ruta. El Día empieza en el día de hoy; cámbialo a "Todos" para ver todos los clientes.',
          'Si quieres, filtra por Estado (Visitados / No visitados) u ordena alfabéticamente.',
          'Busca por código o por nombre con la barra de búsqueda.',
          'Toca al cliente en la tabla para seleccionarlo.',
          'Toca "Validar" en el menú de abajo. Se abren las opciones del cliente.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Si el cliente tiene documentos pendientes de cobro, la app te avisa al validarlo. Es solo informativo: no bloquea nada.',
      },
      { tipo: 'subtitulo', texto: 'Opciones del cliente' },
      {
        tipo: 'lista',
        items: [
          'Pedido y Cotización.',
          'Cobros: pagar documentos pendientes.',
          'Notas de crédito.',
          'Descuentos y promociones del cliente.',
          'Promocionales: solicitudes de material promocional.',
          'Menú Anular: anular el último pedido o cotización.',
          'Menú Consultar: ficha, cobros, documentos, notas de crédito y pedidos del cliente.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Ubicación del cliente' },
      {
        tipo: 'lista',
        items: [
          'Ir al destino: abre el mapa con la ubicación guardada del cliente.',
          'Asignar coordenadas: estando en el negocio del cliente, guarda tu ubicación actual como la suya. Necesita el GPS encendido.',
        ],
      },
    ],
  },
  {
    id: 'visita',
    titulo: 'Registrar la visita',
    icono: 'map-pin',
    resumen: 'Cómo queda registrada cada visita a un cliente.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'Al salir de las opciones del cliente, la app pregunta "¿Desea registrar la visita del cliente?".',
      },
      {
        tipo: 'pasos',
        items: [
          'Responde "Sí".',
          'Revisa la fecha y las horas de inicio y fin (se llenan solas).',
          'Elige el Tipo de visita: Real (en persona) o Telefónica.',
          'Elige el Estado de la visita (por ejemplo, sin necesidad de compra).',
          'Si quieres, toca "Notas" y escribe un comentario.',
          'Toca "Guardar". El cliente queda marcado como visitado.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Cuando guardas un pedido o apruebas una cotización, la visita se registra sola como "Visita efectiva" y ya no te la vuelve a pedir.',
      },
    ],
  },
  {
    id: 'pedido',
    titulo: 'Hacer un pedido',
    icono: 'shopping-cart',
    resumen: 'Paso a paso: encabezado, artículos, descuentos y guardado.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente (ver "Buscar y validar un cliente") y toca "Pedido".',
          'Encabezado: la app llena los datos del cliente (país, departamento, municipio, distrito, condición de pago, lista de precio, subtipo y actividad). Cámbialos solo si hace falta, elige el tipo de documento (Normal o Crédito fiscal) y toca continuar.',
          'Busca el artículo por código o descripción y tócalo. Marca "Incluir artículos sin existencia" si necesitas ver también los que no tienen inventario.',
          'Escribe la cantidad: en almacén (unidades completas) y, si el artículo se vende fraccionado, en detalle.',
          'Si corresponde, aplica el descuento con el contador (ver más abajo).',
          'Toca "Agregar artículo". Repite con cada artículo.',
          'Toca la lupa para revisar los artículos agregados. Ahí puedes quitar alguno.',
          'Abre el resumen: revisa el total, elige la fecha de entrega (desde hoy) y escribe observaciones si hace falta.',
          'Toca guardar. La app te muestra el número del pedido y te ofrece "Imprimir".',
        ],
      },
      { tipo: 'subtitulo', texto: 'Descuentos en el pedido' },
      {
        tipo: 'lista',
        items: [
          'El descuento se sube con el contador, de 1 en 1, empezando en 0. Nunca puede pasar del tope permitido.',
          'El tope no se muestra de entrada: sale del descuento del cliente para ese artículo o de la promoción vigente, el que deje el precio más bajo (no se suman). Si no hay ninguno, se usa el descuento general del cliente.',
          'Un aviso verde indica que hay descuento disponible para esa cantidad. Uno ámbar indica desde qué cantidad aplicaría un descuento o una promoción.',
          'Si cambias la cantidad y el tope baja, el descuento se ajusta solo.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Flete' },
      {
        tipo: 'texto',
        texto:
          'Si tu ruta cobra flete, la app avisa cuánto falta para llegar al mínimo. Mientras el pedido no lo alcance, agrega sola la línea de flete; al llegar al mínimo, la quita. Esa línea no se puede borrar a mano.',
      },
      {
        tipo: 'nota',
        texto:
          'El pedido queda guardado en el equipo y se sube con Datos > Enviar datos. Si sales de la captura sin guardar, se pierden los artículos agregados (la app te pide confirmar).',
      },
    ],
  },
  {
    id: 'cotizacion',
    titulo: 'Cotizaciones',
    icono: 'file-text',
    resumen: 'Crear, aprobar (pasar a pedido) e imprimir cotizaciones.',
    bloques: [
      { tipo: 'subtitulo', texto: 'Crear una cotización' },
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y toca "Cotización".',
          'Toca "Nueva". La captura es igual que la de un pedido (encabezado, artículos, resumen).',
          'Guarda. La cotización queda en la lista del cliente.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Aprobar una cotización' },
      {
        tipo: 'pasos',
        items: [
          'En Cotización, toca la tarjeta de la cotización para seleccionarla.',
          'Toca "Aprobar" y elige la fecha de entrega.',
          'La cotización pasa a ser un pedido con fecha de hoy y la visita se registra como efectiva.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Imprimir: si la cotización ya se envió y hay internet, se usa el PDF del servidor; si no, la app lo arma en el equipo. La línea de color de la tarjeta indica si ya está en el servidor (verde) o solo en el equipo (naranja).',
      },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cobros',
    icono: 'dollar-sign',
    resumen: 'Cobrar documentos, abonos, formas de pago, recibos y cierre del día.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'En Cobros registras lo que el cliente paga de sus documentos pendientes (facturas por cobrar). Cada pago genera un recibo con su número. Todo se guarda en el equipo, sin internet, y se sube con Datos > Enviar datos.',
      },
      { tipo: 'subtitulo', texto: '1. Iniciar el cobro' },
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y toca "Cobros".',
          'Elige la Moneda: Local o Dólar. Todos los montos de los documentos se muestran en esa moneda.',
          'Elige el Tipo de pago (Recibo, Monto total o Selección de facturas). Queda como referencia en el recibo; el pago siempre se hace documento por documento.',
          'Toca continuar.',
        ],
      },
      { tipo: 'subtitulo', texto: '2. Elegir el documento' },
      {
        tipo: 'lista',
        items: [
          'Arriba ves el TOTAL A PAGAR: la suma de todo lo pendiente del cliente.',
          'Cada tarjeta es un documento: número, fecha de emisión y de vencimiento, vendedor y saldo. Los vencidos tienen la línea izquierda roja.',
          'Al tocar una tarjeta se abre el detalle: monto a pagar, fecha en que se hizo, vencimiento, monto y saldo del documento, vendedor y lo ya abonado en el equipo.',
          'Toca "Pagar" en el detalle para registrar el pago de ese documento.',
        ],
      },
      { tipo: 'subtitulo', texto: '3. Registrar el pago' },
      {
        tipo: 'pasos',
        items: [
          'Revisa arriba el SALDO DEL DOCUMENTO y el saldo total del cliente. Si ya tenía abonos en este equipo, se indica cuánto.',
          'Elige la "Cuenta principal del recibo": la cuenta donde vas a depositar el efectivo y los cheques. Las transferencias y depósitos la toman por defecto.',
          'En "Formas de pago" toca cada forma que use el cliente y escribe su monto (ver abajo).',
          'Revisa el "Desglose del pago". Si combinaste formas, aparece la etiqueta HÍBRIDO.',
          'Si quieres, escribe las "Notas del recibo" (máximo 80 caracteres).',
          'Toca guardar. La app te pide confirmar: "Confirmar pago" si cubres todo el saldo o "Confirmar abono" si es una parte.',
          'Se abre el recibo con su número. Desde ahí puedes compartirlo en PDF para enviarlo o imprimirlo.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Formas de pago' },
      {
        tipo: 'lista',
        items: [
          'Efectivo: escribe el monto recibido.',
          'Cheques: puedes agregar varios. Cada cheque con monto necesita número de cheque, número de cuenta y fecha (DD/MM/AAAA); el banco es opcional. El botón de completar llena el último cheque con lo que falta para cubrir el saldo.',
          'Transferencia: monto, número de transacción (solo dígitos) y la cuenta a la que entró (por defecto la principal). Puedes agregar varias.',
          'Depósito: monto, número de boleta (solo dígitos) y la cuenta a la que entró (por defecto la principal). Puedes agregar varios.',
          'Varias cuentas: si el cliente reparte el pago entre bancos (por ejemplo, una transferencia al Agrícola y un depósito al Hipotecario), elige la cuenta de cada uno. Es un solo recibo; el Desglose muestra cuánto entra en cada cuenta.',
          'Pago híbrido: puedes combinar varias formas en el mismo pago (por ejemplo, una parte en efectivo y otra en cheque); todas se suman.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Pago completo o abono' },
      {
        tipo: 'texto',
        texto:
          'Puedes pagar todo el saldo o solo una parte (abono). Por ejemplo, un documento de $100 con un abono de $20 queda con $80, y el siguiente pago parte de esos $80. No se puede pagar más que el saldo del documento.',
      },
      {
        tipo: 'lista',
        items: [
          'Saldo total: todo lo que debe el cliente, sumando sus documentos.',
          'Total a pagar: el saldo actual de este documento.',
          'Saldo restante: lo que falta por cubrir de lo que se va a pagar.',
          'Saldo pendiente: lo que le quedará debiendo a este documento después del pago.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Ver o reimprimir un recibo' },
      {
        tipo: 'pasos',
        items: [
          'Entra a Cobros del cliente y continúa hasta la lista de documentos.',
          'Cambia el filtro a "Abonos anteriores".',
          'Toca el recibo para abrirlo y compartirlo en PDF.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Los recibos no se pueden eliminar desde la app. Revisa bien los montos y la cuenta de banco antes de confirmar.',
      },
      { tipo: 'subtitulo', texto: 'Consultar lo que debe un cliente' },
      {
        tipo: 'texto',
        texto:
          'Sin registrar un pago, puedes ver los documentos pendientes en Menú Consultar > Cobros (o en la pestaña Consulta > Cobros). El color de cada documento indica si está vencido o por vencer; al tocarlo ves el detalle y el botón Imprimir descarga su PDF (necesita internet). Consulta > Documentos muestra solo los vencidos, del más atrasado al más reciente.',
      },
      { tipo: 'subtitulo', texto: 'Al terminar el día' },
      {
        tipo: 'pasos',
        items: [
          'Entra a Reportes > Cierre de Cobro.',
          'En Resumen revisa el total cobrado, el efectivo a entregar y los totales por forma de pago, cheques, transferencias y cuenta de banco.',
          'En Recibos revisa cada recibo del día; tocar uno lo imprime.',
          'En Por cobrar revisa lo que faltó cobrar hoy (documentos vencidos o que vencen hoy sin abono).',
          'Toca "Imprimir cierre" para generar el PDF del cuadre.',
          'Envía los recibos con Datos > Enviar datos.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'El Calendario muestra los vencimientos de los documentos por día, para planificar a quién cobrar. Si al guardar aparece "no tiene consecutivo de recibo", haz Datos > Cargar datos.',
      },
    ],
  },
  {
    id: 'notas-credito',
    titulo: 'Notas de crédito',
    icono: 'file-minus',
    resumen: 'Devoluciones, rebajas y correcciones sobre un Crédito Fiscal.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'La nota de crédito siempre se hace sobre un Comprobante de Crédito Fiscal (CCF, número que empieza con DTE-03-). A un cliente con solo facturas de consumidor final (DTE-01-) no se le puede hacer.',
      },
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y toca "Notas de crédito".',
          'Elige el CCF que vas a afectar.',
          'Elige el Motivo: Devolución de mercadería, Rebaja de precio, Corrección de precio u Otro motivo.',
          'Escribe la Razón y, si quieres, las Observaciones.',
          'Completa lo que pide el motivo (ver abajo) y toca "Guardar nota de crédito".',
        ],
      },
      { tipo: 'subtitulo', texto: 'Devolución de mercadería (01)' },
      {
        tipo: 'lista',
        items: [
          'Aparecen los artículos del CCF. En cada uno escribe la cantidad que regresa y marca si viene en buen o mal estado.',
          'Se acredita al precio del CCF, con su mismo descuento.',
          'Facturado: lo vendido de ese artículo en el CCF.',
          'Devuelto: lo ya acreditado antes (en el sistema o en otras notas pendientes).',
          'Disponible: lo que aún se puede acreditar. No puedes pasarte de esta cantidad.',
          '"Ya no queda cantidad por acreditar": ese artículo ya se acreditó completo.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Rebaja de precio (02), Corrección de precio (03) y Otro motivo (99)' },
      {
        tipo: 'lista',
        items: [
          'No se muestran los artículos: la nota lleva una sola línea con el código 00000.',
          'La Razón es obligatoria y es la descripción de esa línea (máximo 80 caracteres).',
          'Escribe el monto a acreditar CON IVA incluido. La app separa la base y el IVA.',
          'Arriba ves el total del CCF, lo ya acreditado en otras notas de ese CCF y el disponible. El monto no puede pasar del disponible.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Si el servidor rechaza una nota' },
      {
        tipo: 'pasos',
        items: [
          'Entra a Menú Consultar > Notas de crédito y abre la nota marcada "CON ERROR". Ahí verás el motivo.',
          '"Corregir" abre la nota con lo que tenía. Ajusta y guarda: conserva el mismo número.',
          '"Descartar" la borra del equipo, si ya no aplica.',
          'Envía de nuevo con Datos > Enviar datos.',
        ],
      },
    ],
  },
  {
    id: 'inventario',
    titulo: 'Inventario del cliente',
    icono: 'clipboard',
    resumen: 'Contar cuánto tiene el cliente de cada artículo.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'Sirve para registrar cuánto producto tiene el cliente en su negocio. Se cuenta por artículo, en cajas y, si el artículo se vende fraccionado, en unidades.',
      },
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y entra a Menú Consultar > Inventario.',
          'Toca "Nuevo inventario".',
          'Busca el artículo por código o descripción.',
          'Escribe lo que tiene el cliente: cajas y, si aparece, unidades.',
          'Deja vacío lo que no contaste. Escribe 0 si el cliente no tiene el artículo: también cuenta.',
          'Marca "Ver solo los artículos contados" para revisar lo que llevas.',
          'Toca "Guardar inventario" y confirma. La app te muestra su número.',
        ],
      },
      {
        tipo: 'lista',
        items: [
          'Los artículos contados se marcan en verde con un check.',
          'El inventario se numera con el consecutivo de inventario de la ruta y se sube con Datos > Enviar datos.',
          'Si sales sin guardar, la app te pide confirmar porque se pierde lo contado.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Consultar inventarios' },
      {
        tipo: 'texto',
        texto:
          'En Menú Consultar > Inventario ves los inventarios del cliente con su estado: sin enviar, con error, pendiente de procesar o procesado. Al tocar uno ves lo contado por artículo. En la pestaña Consulta > Inventario (sin validar al cliente) solo se pueden ver, no hacer.',
      },
      {
        tipo: 'nota',
        texto:
          'Si el servidor rechaza un inventario, el motivo aparece en su detalle. Los que siguen sin enviar se pueden descartar desde la consulta; en ese caso, haz uno nuevo.',
      },
    ],
  },
  {
    id: 'descuentos',
    titulo: 'Descuentos y promociones',
    icono: 'tag',
    resumen: 'Ver los descuentos del cliente y las promociones vigentes.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y toca "Descuentos y promociones".',
          'Pestaña Descuentos: los descuentos del cliente por artículo, con su rango de cantidades y vigencia. El valor está oculto; toca "Ver descuento" para mostrarlo.',
          'Pestaña Promociones: las promociones activas para el cliente o su ruta.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Atajo: al tocar un descuento puedes elegir "Hacer pedido" o "Hacer cotización" y la captura se abre directamente con ese artículo.',
      },
    ],
  },
  {
    id: 'promocionales',
    titulo: 'Promocionales',
    icono: 'gift',
    resumen: 'Solicitar material promocional para un cliente.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Valida al cliente y toca "Promocionales".',
          'Toca "Nueva solicitud".',
          'Elige la fecha requerida y escribe las notas (qué se necesita).',
          'Guarda. Queda como "Sin enviar" hasta que hagas Datos > Enviar datos.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Una solicitud "Sin enviar" todavía se puede eliminar. Las tarjetas en verde ya fueron procesadas; las ámbar siguen pendientes.',
      },
    ],
  },
  {
    id: 'anular',
    titulo: 'Anular un pedido o cotización',
    icono: 'x-circle',
    resumen: 'Cuándo y cómo anular un documento del día.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Valida cualquier cliente de la ruta y toca "Menú Anular".',
          'Elige la pestaña Pedidos o Cotizaciones.',
          'Toca el documento que se puede anular y confirma.',
        ],
      },
      {
        tipo: 'lista',
        items: [
          'Solo se puede anular el ÚLTIMO documento del día de ese tipo que todavía no se ha enviado. Los demás muestran por qué no se pueden anular.',
          'Al anularlo se borra del equipo y su número se reutiliza en el siguiente documento.',
          'La visita de ese cliente pasa a "Sin necesidad de compra".',
        ],
      },
    ],
  },
  {
    id: 'consultas',
    titulo: 'Consultar información del cliente',
    icono: 'search',
    resumen: 'Ficha, cobros, documentos, notas y pedidos.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'Puedes consultar de dos formas: desde Menú Consultar (con el cliente validado) o desde la pestaña "Consulta" de abajo en Clientes, con el cliente seleccionado y sin registrar visita.',
      },
      {
        tipo: 'lista',
        items: [
          'Cliente: la ficha con sus datos comerciales, de contacto y ubicación (se puede editar, ver la siguiente sección).',
          'Inventario: los inventarios del cliente con lo contado por artículo. En Menú Consultar también se hace uno nuevo; en la pestaña Consulta solo se ven.',
          'Cobros: documentos pendientes de cobro. Al tocar uno puedes imprimir su PDF (necesita internet).',
          'Documentos: en Menú Consultar, el historial de facturas del cliente con su detalle y montos. En la pestaña Consulta, solo los documentos vencidos.',
          'Notas de crédito: las notas del cliente y su estado (sin enviar, con error, pendiente de procesar o procesada).',
          'Pedidos: en Menú Consultar, el historial de pedidos del sistema. En la pestaña Consulta, los pedidos y cotizaciones hechos en el equipo, que se pueden imprimir.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Las consultas funcionan sin internet con lo descargado en Cargar datos. Solo imprimir un documento del servidor necesita conexión.',
      },
    ],
  },
  {
    id: 'ficha',
    titulo: 'Editar la ficha del cliente',
    icono: 'edit-3',
    resumen: 'Actualizar datos del cliente desde la app.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Abre la ficha: Menú Consultar > Cliente.',
          'Toca el lápiz del encabezado para editar.',
          'Cambia los datos que necesites. El código del cliente, los días de visita y las facturas pendientes no se editan.',
          'Para la ubicación: elige primero el Departamento, luego el Municipio y al final el Distrito. Cada lista muestra solo lo que corresponde a la anterior.',
          'Toca guardar, revisa la lista de cambios y confirma.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'Los cambios se guardan en el equipo y se envían de una vez si hay internet. Si no hay, quedan pendientes para Datos > Enviar datos. Departamento, municipio y distrito siempre se envían juntos.',
      },
    ],
  },
  {
    id: 'reportes',
    titulo: 'Reportes',
    icono: 'bar-chart-2',
    resumen: 'Vendido y cobrado, cierre de cobro, visitas e inventario.',
    bloques: [
      {
        tipo: 'texto',
        texto: 'Todos los reportes se calculan en el equipo y funcionan sin internet.',
      },
      {
        tipo: 'lista',
        items: [
          'Cobrado y Vendido: lo vendido hoy (pedidos y cotizaciones aprobadas) y lo cobrado hoy (recibos). Toca un documento para imprimirlo.',
          'Cierre de Cobro: cuadre del día. Resumen con el efectivo a entregar y el total por forma de pago y por cuenta de banco; los recibos del día; y lo que faltó cobrar. "Imprimir cierre" genera el PDF.',
          'Visitas (Mi día): avance de visitas contra los clientes programados hoy y lo logrado (pedidos, cotizaciones, cobros y promocionales), con la línea de tiempo del día.',
          'Inventario: existencias de tu ruta. El botón de lotes muestra lote, vencimiento y existencia.',
        ],
      },
      { tipo: 'subtitulo', texto: 'Ficha técnica de un artículo' },
      {
        tipo: 'pasos',
        items: [
          'Entra a Reportes > Inventario.',
          'Toca la tarjeta del artículo para seleccionarla.',
          'Si tiene ficha, aparece "Ver ficha técnica". Tócalo para abrir el PDF.',
        ],
      },
      {
        tipo: 'nota',
        texto:
          'La primera vez que abres una ficha necesitas internet. Después queda guardada en el equipo y se abre sin conexión mientras no la cambien en la web.',
      },
    ],
  },
  {
    id: 'metas',
    titulo: 'Metas',
    icono: 'award',
    resumen: 'Seguimiento de tus metas de venta.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'En Metas ves tus metas de venta por artículo del mes, agrupadas por línea y proveedor: la meta, el mínimo, lo vendido, el porcentaje de avance, el estado y el incentivo.',
      },
      {
        tipo: 'lista',
        items: [
          'Lo vendido se calcula en el equipo con tus pedidos y facturas, sin internet.',
          'Cuando cumples una meta del mes, la app te lo celebra.',
          'Las metas se actualizan con Datos > Cargar datos.',
        ],
      },
    ],
  },
  {
    id: 'calendario',
    titulo: 'Calendario',
    icono: 'calendar',
    resumen: 'Vencimientos de los documentos por cobrar.',
    bloques: [
      {
        tipo: 'pasos',
        items: [
          'Entra a Calendario.',
          'Arriba elige ver todos los documentos o solo los que te toca cobrar.',
          'Los días marcados tienen vencimientos: rojo = ya vencido, ámbar = por vencer.',
          'Toca un día para ver sus documentos con el cliente, el número y el saldo.',
        ],
      },
    ],
  },
  {
    id: 'parametros',
    titulo: 'Parámetros',
    icono: 'settings',
    resumen: 'Consecutivos, datos del dispositivo y este manual.',
    bloques: [
      {
        tipo: 'lista',
        items: [
          'Sistema: los consecutivos de documentos de la ruta (pedido, recibo, nota de crédito, etc.), es decir, el próximo número que se usará.',
          'Dispositivo: ruta, fecha y hora, versión de la app y la configuración de flete de la ruta.',
          'Manual de usuario: esta guía.',
        ],
      },
    ],
  },
  {
    id: 'problemas',
    titulo: 'Rutina diaria y dudas',
    icono: 'help-circle',
    resumen: 'La rutina recomendada del día y dónde resolver dudas.',
    bloques: [
      {
        tipo: 'texto',
        texto:
          'Las dudas comunes y los mensajes de error más frecuentes, con su solución, están en Parámetros > Consultas (preguntas frecuentes).',
      },
      {
        tipo: 'nota',
        texto:
          'Recomendación diaria: al empezar, Cargar datos; durante el día, Enviar datos cuando tengas señal; al terminar, Enviar datos y revisar que "Pendientes de enviar" quede en 0.',
      },
    ],
  },
];
