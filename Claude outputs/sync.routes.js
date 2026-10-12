// routes/fr/sync.js  (copiar a tu backend)
// Sin middleware de sesión: la handheld sincroniza sin hacer login.
// Queda como GET /fr/sync/clientes (el prefijo depende de cómo montes este router).

const { Router } = require("express");
const { getSyncClientes } = require("../../controllers/fr/sync");

const router = Router();

router.get("/clientes", getSyncClientes);

module.exports = router;

// En tu app/index de rutas, móntalo así (ajusta al estilo que ya usas):
//   app.use("/api/fr/sync", require("./routes/fr/sync"));
