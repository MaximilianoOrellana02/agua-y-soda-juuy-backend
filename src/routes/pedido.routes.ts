import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { esUuid } from '../utils/cliente.validation';
import { crearPedido, eliminarPedido, listarPedidos, marcarEntregado } from "../controllers/pedido.controller";

const router = Router();
router.use(verificarToken);
router.param('id', (req, res, next, id) => {
    if (!esUuid(id)) return res.status(400).json({ error: 'Id de pedido invalido' });
    next();
});

router.post('/', crearPedido);
router.get("/", listarPedidos);
router.put("/:id/entregar", marcarEntregado);
router.delete("/:id", eliminarPedido)

export default router

// Pedido corregido:
// - Entrada validada antes de tocar la base: clienteId UUID, detalle opcional como texto recortado de hasta 255
//   (vacio se guarda null); numeros, objetos o textos mas largos responden 400 (antes: numeros se guardaban como
//   texto, objetos y textos largos daban 500, y quedaban detalles en blanco o con espacios).
// - Ids no UUID responden 400 en vez de 404.
// - Entregar y eliminar bloquean el pedido en una transaccion: entregar dos veces responde 409, y un pedido entregado
//   no se elimina (409) porque forma parte del historial del cliente (antes se borraba sin aviso).
// - Listado: por defecto pendientes del mas antiguo al mas nuevo; ?estado=entregado o ?estado=todos (del mas nuevo al
//   mas antiguo) y ?clienteId=<uuid> como filtros validados; tope de 1000 filas informado en X-Limite-Pedidos.
// - Errores clasificados (400/404/409/503/500) y mensajes sin errores de tipeo.
// - Migracion harden-pedidos: recorta detalles y deja null los vacios, indice (estado, fecha) y default de fecha en la base.
