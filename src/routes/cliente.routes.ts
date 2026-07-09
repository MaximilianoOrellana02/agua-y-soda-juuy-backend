import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { actualizarCliente, crearCliente, eliminarCliente, listarClientes, obtenerCliente, obtenerSaldoEnvases } from "../controllers/cliente.controller";


const router = Router()
router.use(verificarToken)

router.post('/', crearCliente);
router.get('/', listarClientes);
router.get('/:id', obtenerCliente);
router.put('/:id', actualizarCliente);
router.delete('/:id', eliminarCliente)
router.get('/:id/envases', obtenerSaldoEnvases)

export default router