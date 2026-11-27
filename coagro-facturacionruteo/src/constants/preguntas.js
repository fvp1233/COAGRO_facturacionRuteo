// Preguntas frecuentes (Parámetros > Consultas). Cada grupo: { id, titulo, icono (Feather), preguntas:
// [{ pregunta, respuesta }] }. La respuesta puede ser un texto o una lista de textos (párrafos).
// Para cambiar las preguntas basta con editar este archivo.

export const PREGUNTAS = [
  {
    id: 'datos',
    titulo: 'Datos y conexión',
    icono: 'refresh-cw',
    preguntas: [
      {
        pregunta: '¿Necesito internet para trabajar?',
        respuesta: [
          'No. Después del primer uso puedes iniciar sesión, hacer pedidos, cobrar, registrar visitas y consultar sin internet: todo se guarda en el equipo.',
          'Solo necesitas conexión para Cargar datos, Enviar datos, imprimir un documento desde el servidor y abrir por primera vez una ficha técnica.',
        ],
      },
      {
        pregunta: '¿Cómo hago para no escribir mi usuario cada vez que abro la app?',
        respuesta: [
          'Al iniciar sesión deja marcada "Mantener sesión iniciada". La próxima vez entrarás directo.',
          'La sesión se vuelve a pedir solo si pasas 30 días sin abrir la app, si tocas "Cerrar sesión" o si cambió tu contraseña.',
        ],
      },
      {
        pregunta: '¿Cada cuánto debo cargar y enviar datos?',
        respuesta:
          'Lo recomendado: Cargar datos al empezar el día, Enviar datos cuando tengas señal durante el día y Enviar datos al terminar, revisando que "Pendientes de enviar" quede en 0.',
      },
      {
        pregunta: '¿Si hago Cargar datos se borra lo que registré?',
        respuesta:
          'No. Cargar datos primero envía lo pendiente y solo reemplaza la información del equipo si todo se envió. Si algo no se pudo enviar, no borra nada. Si la conexión se corta a medias, el equipo queda como estaba.',
      },
      {
        pregunta: 'Una lista me sale vacía (artículos, estados de visita, departamentos, créditos fiscales). ¿Qué hago?',
        respuesta:
          'Haz Datos > Cargar datos. Esas listas vienen del sistema y se llenan con la carga.',
      },
      {
        pregunta: 'Al enviar, un registro salió rechazado. ¿Qué significa?',
        respuesta: [
          'El servidor no aceptó ese registro y te muestra el motivo. Los demás registros del envío sí se guardaron.',
          'El registro rechazado sigue en el equipo como pendiente. Corrígelo según el motivo y vuelve a enviar.',
        ],
      },
      {
        pregunta: 'Me aparece "no tiene consecutivo" al guardar un pedido, recibo o nota de crédito.',
        respuesta: 'Faltan los consecutivos de tu ruta en el equipo. Haz Datos > Cargar datos.',
      },
    ],
  },
  {
    id: 'clientes',
    titulo: 'Clientes y visitas',
    icono: 'users',
    preguntas: [
      {
        pregunta: 'No encuentro a un cliente en la lista.',
        respuesta:
          'Revisa la Ruta elegida y cambia el Día a "Todos": por defecto se muestran solo los clientes de hoy. Revisa también el filtro de Estado. Si aun así no aparece, haz Datos > Cargar datos.',
      },
      {
        pregunta: 'Toco "Validar" y me dice "Selecciona un cliente de la tabla primero".',
        respuesta: 'Toca primero al cliente en la tabla para seleccionarlo y luego "Validar".',
      },
      {
        pregunta: '¿Tengo que registrar la visita cada vez?',
        respuesta:
          'Al salir del cliente la app te lo pregunta. Si hiciste un pedido o aprobaste una cotización, la visita se registra sola como efectiva y ya no te lo pide.',
      },
      {
        pregunta: 'Al registrar la visita no me aparecen estados.',
        respuesta: 'Haz Datos > Cargar datos para descargar los estados de visita.',
      },
      {
        pregunta: '"Ir al destino" dice que el cliente no tiene coordenadas.',
        respuesta:
          'Ese cliente aún no tiene ubicación guardada. Cuando estés en su negocio, usa "Asignar coordenadas" con el GPS encendido.',
      },
      {
        pregunta: '¿Puedo cambiar los datos de un cliente?',
        respuesta:
          'Sí, en Menú Consultar > Cliente, con el lápiz del encabezado. Los cambios se envían solos si hay internet; si no, quedan pendientes para Datos > Enviar datos. El código, los días de visita y las facturas pendientes no se editan.',
      },
      {
        pregunta: 'No puedo elegir el municipio o el distrito en la ficha.',
        respuesta:
          'Van en orden: primero elige el Departamento, después el Municipio y al final el Distrito. Cada lista muestra solo lo que pertenece a la anterior.',
      },
    ],
  },
  {
    id: 'pedidos',
    titulo: 'Pedidos y cotizaciones',
    icono: 'shopping-cart',
    preguntas: [
      {
        pregunta: 'No me aparece un artículo al hacer el pedido.',
        respuesta: [
          'Por defecto solo se muestran los artículos con existencia. Marca "Incluir artículos sin existencia" para ver todos.',
          'Solo aparecen los artículos de tu ruta activa con precio vigente en la lista de precio del pedido. Si cambiaste de ruta, revísala en el menú del inicio > "Cambiar ruta".',
        ],
      },
      {
        pregunta: '¿Por qué no puedo subir más el descuento?',
        respuesta:
          'Llegaste al tope permitido para ese artículo y esa cantidad. El tope sale del descuento del cliente o de la promoción vigente (el que deje el precio más bajo) o, si no hay, del descuento general del cliente. A veces subir la cantidad habilita un descuento mayor: el aviso ámbar te dice desde qué cantidad.',
      },
      {
        pregunta: 'Se agregó una línea de flete que no puse.',
        respuesta:
          'Tu ruta cobra flete cuando el pedido no llega al mínimo. La línea se agrega y se quita sola; el aviso te dice cuánto falta para evitarlo.',
      },
      {
        pregunta: '¿Cómo cambio un artículo que ya agregué?',
        respuesta:
          'Tócalo de nuevo en la lista, cambia la cantidad o el descuento y toca "Actualizar artículo". Para quitarlo, abre la lupa (artículos agregados) y elimínalo.',
      },
      {
        pregunta: '¿Cómo paso una cotización a pedido?',
        respuesta:
          'En Cotización, toca la tarjeta de la cotización, luego "Aprobar" y elige la fecha de entrega. Queda como pedido con fecha de hoy.',
      },
      {
        pregunta: 'Me equivoqué en un pedido. ¿Lo puedo anular?',
        respuesta:
          'Sí, si es el último pedido del día y todavía no se envió: Menú Anular > Pedidos. Su número se reutiliza en el siguiente pedido. Si ya se envió, comunícate con la oficina.',
      },
      {
        pregunta: '¿Puedo imprimir un pedido sin internet?',
        respuesta:
          'Sí. Si no hay conexión o el pedido aún no se envió, la app arma el PDF en el equipo. Con internet y el pedido ya enviado, usa el PDF del servidor.',
      },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cobros',
    icono: 'dollar-sign',
    preguntas: [
      {
        pregunta: '¿Puedo cobrar solo una parte de un documento?',
        respuesta:
          'Sí, es un abono. Escribe el monto que paga el cliente y lo que falte queda pendiente. El siguiente pago parte del saldo que quedó.',
      },
      {
        pregunta: '¿Puedo combinar efectivo y cheque en el mismo pago?',
        respuesta:
          'Sí. Escribe el monto en cada forma de pago; todas se suman. Puedes agregar varios cheques.',
      },
      {
        pregunta: 'Me dice que el monto pagado supera el saldo.',
        respuesta: 'No se puede pagar más que el saldo del documento. Revisa los montos de cada forma de pago.',
      },
      {
        pregunta: '¿Qué datos pide un cheque?',
        respuesta:
          'Número de cheque, número de cuenta, fecha (DD/MM/AAAA) y monto. El banco es opcional.',
      },
      {
        pregunta: '¿Qué cuenta de banco elijo en el recibo?',
        respuesta:
          'La cuenta principal es donde vas a depositar el efectivo y los cheques. Cada transferencia y depósito lleva la cuenta a la que el cliente pagó: por defecto la principal, pero puedes elegir otra si repartió el pago entre bancos.',
      },
      {
        pregunta: '¿Puedo borrar un recibo?',
        respuesta:
          'No. Los recibos no se eliminan desde la app; por eso revisa bien antes de confirmar. Si hubo un error, comunícate con la oficina.',
      },
      {
        pregunta: '¿Dónde veo o reimprimo un recibo anterior?',
        respuesta:
          'En Cobros del cliente, en la lista de documentos, cambia el filtro a "Abonos anteriores" y toca el recibo. También en Reportes > Cierre de Cobro, en la pestaña Recibos.',
      },
      {
        pregunta: '¿Cómo sé cuánto efectivo debo entregar?',
        respuesta: 'En Reportes > Cierre de Cobro, el Resumen muestra el efectivo a entregar y los totales por forma de pago y por cuenta.',
      },
    ],
  },
  {
    id: 'notas-credito',
    titulo: 'Notas de crédito',
    icono: 'file-minus',
    preguntas: [
      {
        pregunta: 'Dice que el cliente no tiene Comprobantes de Crédito Fiscal.',
        respuesta: [
          'La nota de crédito solo se hace sobre un CCF (número que empieza con DTE-03-). Si el cliente solo tiene facturas de consumidor final (DTE-01-), no se le puede hacer.',
          'Si debería tener alguno, haz Datos > Cargar datos para actualizar el historial. El historial trae solo los últimos meses.',
        ],
      },
      {
        pregunta: 'Me sale "Ya no queda cantidad por acreditar de este artículo".',
        respuesta:
          'Ese artículo ya se acreditó completo: Devuelto es igual a Facturado. Lo devuelto incluye lo registrado en el sistema y las notas de ese CCF que aún no procesa la oficina.',
      },
      {
        pregunta: '¿Qué motivo elijo?',
        respuesta: [
          'Devolución de mercadería: el cliente regresa producto. Se acredita al precio del CCF y marcas si viene en buen o mal estado.',
          'Rebaja de precio, Corrección de precio u Otro motivo: no hay producto de regreso. No se eligen artículos: escribes la razón (obligatoria) y el monto total a acreditar, con IVA incluido.',
        ],
      },
      {
        pregunta: 'En una rebaja me dice que el monto supera lo disponible del CCF.',
        respuesta:
          'El monto (con IVA) no puede pasar del total del CCF menos lo que ya acreditan otras notas sobre ese mismo CCF. En la pantalla ves el total, lo ya acreditado y el disponible.',
      },
      {
        pregunta: 'El servidor rechazó una nota de crédito. ¿Qué hago?',
        respuesta:
          'Entra a Menú Consultar > Notas de crédito y abre la nota "CON ERROR" para ver el motivo. Usa "Corregir" para ajustarla (conserva su número) o "Descartar" si ya no aplica. Después envía de nuevo.',
      },
    ],
  },
  {
    id: 'inventario',
    titulo: 'Inventario del cliente',
    icono: 'clipboard',
    preguntas: [
      {
        pregunta: '¿Dónde hago el inventario de un cliente?',
        respuesta:
          'Valida al cliente, entra a Menú Consultar > Inventario y toca "Nuevo inventario". En la pestaña Consulta > Inventario (sin validar) solo puedes ver los que ya existen.',
      },
      {
        pregunta: '¿Qué diferencia hay entre dejar un artículo vacío y escribir 0?',
        respuesta:
          'Vacío significa que no lo contaste y no se guarda. 0 significa que lo contaste y el cliente no tiene ese artículo: sí se guarda.',
      },
      {
        pregunta: 'Me dice "no tiene consecutivo de inventario".',
        respuesta: 'Faltan los consecutivos de tu ruta en el equipo. Haz Datos > Cargar datos.',
      },
      {
        pregunta: 'No aparecen artículos para contar.',
        respuesta:
          'Se muestran los artículos de tu ruta activa. Revisa la ruta en el menú del inicio > "Cambiar ruta" y, si sigue vacío, haz Datos > Cargar datos.',
      },
      {
        pregunta: 'El servidor rechazó un inventario. ¿Qué hago?',
        respuesta:
          'Abre el inventario en Menú Consultar > Inventario para ver el motivo. Si no se puede corregir, descártalo y haz uno nuevo.',
      },
    ],
  },
  {
    id: 'otros',
    titulo: 'Otros',
    icono: 'more-horizontal',
    preguntas: [
      {
        pregunta: '¿Dónde veo la ficha técnica de un artículo?',
        respuesta:
          'En Reportes > Inventario: toca el artículo y, si tiene ficha, aparece "Ver ficha técnica". La primera vez necesita internet; después se abre sin conexión.',
      },
      {
        pregunta: '¿Cómo cambio de ruta?',
        respuesta: 'En el inicio, abre el menú de la esquina superior y toca "Cambiar ruta".',
      },
      {
        pregunta: 'Mis metas no se actualizan.',
        respuesta:
          'Las metas se descargan con Datos > Cargar datos. Lo vendido se calcula en el equipo con tus pedidos y facturas guardados.',
      },
      {
        pregunta: 'La app me pide el GPS.',
        respuesta:
          'Enciende la ubicación del teléfono y da permiso a la app. Se usa para registrar las visitas y asignar coordenadas a los clientes.',
      },
      {
        pregunta: '¿Dónde aprendo a usar cada parte de la app?',
        respuesta: 'En Parámetros > Manual de usuario está la guía paso a paso de cada módulo.',
      },
    ],
  },
];
