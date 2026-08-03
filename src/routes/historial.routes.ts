import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearEntrega, historialPorCliente, listarHistorial, resumenHistorial, resumenHoy } from "../controllers/historial.controller";

const router = Router();

router.use(verificarToken);

router.post('/', crearEntrega);
router.get('/resumen-hoy', resumenHoy)
router.get('/cliente/:clienteId', historialPorCliente)
router.get('/', listarHistorial)
router.get('/resumen', resumenHistorial);

export default router