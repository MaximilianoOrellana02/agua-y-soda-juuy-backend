import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearMovimientoStock, listarMovimientosStock } from "../controllers/stock.controller";

const router = Router();

router.use(verificarToken);

router.post('/movimientos', crearMovimientoStock);
router.get('/movimientos', listarMovimientosStock)

export default router;