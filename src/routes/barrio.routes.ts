import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { actualizarBarrio, crearBarrio, eliminarBarrio, listarBarrios } from "../controllers/barrio.controller";

const router = Router()

router.use(verificarToken);

router.get('/', listarBarrios);
router.post('/', crearBarrio);
router.delete('/:id', eliminarBarrio);
router.put('/:id', actualizarBarrio);

export default router