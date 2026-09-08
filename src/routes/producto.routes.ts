import { Router } from "express";
import { verificarToken } from "../middlewares/auth.middleware";
import { esUuid } from '../utils/cliente.validation';
import { actualizarProducto, cambiarPrecio, crearProducto, desactivarProducto, listarProductos } from "../controllers/producto.controller";

const router = Router()

router.use(verificarToken)
router.param('id', (req, res, next, id) => {
    if (!esUuid(id)) return res.status(400).json({ error: 'Id de producto invalido' });
    next();
});

router.post('/', crearProducto);
router.get('/', listarProductos);
router.put('/:id/precio', cambiarPrecio);
router.delete('/:id', desactivarProducto);
router.put('/:id', actualizarProducto);

export default router;

// Producto corregido:
// - Entrada validada antes de tocar la base: nombre texto recortado de 1 a 100, precios numericos > 0 con 2 decimales,
//   tipoCliente particular/confianza, esRetornable/activo booleanos, stockMinimo entero >= 0, id UUID. Todo invalido da 400
//   (antes: nombres vacios o numericos y precios negativos se guardaban; precios no numericos daban 500).
// - Alta en una transaccion: si falla un precio no queda un producto sin precios. Duplicados (sin distinguir mayusculas)
//   responden 409 en vez de 500.
// - Listado: solo el precio vigente por tipo de cliente (antes devolvia todo el historial); ?incluirInactivos=true
//   muestra tambien los dados de baja.
// - Baja logica: 204, 409 si ya estaba desactivado; un producto desactivado no admite cambios de precio (409) y se
//   reactiva con PUT /:id { activo: true } (antes no habia forma de recuperarlo ni de reusar su nombre).
// - Precios: se cambian solo por PUT /:id/precio bloqueando el producto; la vigencia usa un criterio unico compartido
//   con el historial de entregas (services/producto.service.ts). precio se expone como numero.
// - Migracion harden-productos: fechaDesde con milisegundos y default en la base (dos cambios en el mismo segundo
//   empataban), indice (productoId, tipoCliente, fechaDesde), recorte de nombres y rechazo de precios no positivos.
