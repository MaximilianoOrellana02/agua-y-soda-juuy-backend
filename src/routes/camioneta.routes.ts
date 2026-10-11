import { Router } from "express";
import { soloAdmin, verificarToken } from "../middlewares/auth.middleware";
import { esUuid } from "../utils/cliente.validation";
import {
  actualizarCamioneta,
  cargarCamioneta,
  crearCamioneta,
  dejarCamioneta,
  elegirCamioneta,
  listarCamionetas,
  miCamioneta,
  moverStockCamioneta,
  stockDeCamioneta,
} from "../controllers/camioneta.controller";

const router = Router();

router.use(verificarToken);
router.param("id", (req, res, next, id) => {
  if (!esUuid(id)) return res.status(400).json({ error: "Id de camioneta invalido" });
  next();
});

router.get("/", listarCamionetas);
router.get("/mia", miCamioneta);
router.delete("/mia", dejarCamioneta);
router.post("/", soloAdmin, crearCamioneta);
router.put("/:id", soloAdmin, actualizarCamioneta);
router.get("/:id/stock", stockDeCamioneta);
router.post("/:id/elegir", elegirCamioneta);
router.post("/:id/movimientos", moverStockCamioneta);
router.post("/:id/carga", cargarCamioneta);

export default router;
