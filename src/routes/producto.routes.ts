import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { actualizarProducto, cambiarPrecio, crearProducto, desactivarProducto, listarProductos } from "../controllers/producto.controller";

const router = Router()

router.use(verificarToken)

router.post('/', crearProducto);
router.get('/', listarProductos);
router.put('/:id/precio', cambiarPrecio);
router.delete('/:id', desactivarProducto);
router.put('/:id', actualizarProducto);

export default router;