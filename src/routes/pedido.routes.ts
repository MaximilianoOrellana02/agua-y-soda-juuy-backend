import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { crearPedido, eliminarPedido, listarPedidosPendientes, marcarEntregado } from "../controllers/pedido.controller";

const router = Router();
router.use(verificarToken);

router.post('/', crearPedido);
router.get("/", listarPedidosPendientes);
router.put("/:id/entregar", marcarEntregado);
router.delete("/:id", eliminarPedido)

export default router