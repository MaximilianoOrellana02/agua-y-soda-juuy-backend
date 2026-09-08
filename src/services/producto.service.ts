import { Op, Order, Transaction, literal } from 'sequelize';
import Producto from '../models/Producto';
import PrecioProducto from '../models/PrecioProducto';
import { TipoClientePrecio } from '../utils/producto.validation';

// Un unico criterio de vigencia para todos los modulos: el ultimo precio cargado. createdAt e id
// desempatan filas que hayan quedado con la misma fechaDesde (datos previos a la migracion harden-productos).
export const ORDEN_VIGENCIA: Order = [['fechaDesde', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']];

export function precioVigente(productoId: string, tipoCliente: TipoClientePrecio, transaction?: Transaction) {
    return PrecioProducto.findOne({ where: { productoId, tipoCliente }, order: ORDEN_VIGENCIA, transaction });
}

// Devuelve, por producto, solo el precio vigente de cada tipo de cliente (a lo sumo dos filas por producto),
// sin cargar todo el historial de precios.
export async function preciosVigentes(productoIds: string[], transaction?: Transaction): Promise<Map<string, PrecioProducto[]>> {
    const porProducto = new Map<string, PrecioProducto[]>(productoIds.map(id => [id, []]));
    if (!productoIds.length) return porProducto;
    const precios = await PrecioProducto.findAll({
        where: {
            productoId: { [Op.in]: productoIds },
            [Op.and]: [literal('(`PrecioProducto`.`productoId`, `PrecioProducto`.`tipoCliente`, `PrecioProducto`.`fechaDesde`) IN ' +
                '(SELECT productoId, tipoCliente, MAX(fechaDesde) FROM precios_producto GROUP BY productoId, tipoCliente)')],
        },
        order: ORDEN_VIGENCIA,
        transaction,
    });
    const vistos = new Set<string>();
    for (const precio of precios) {
        const clave = precio.productoId + ':' + precio.tipoCliente;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        porProducto.get(precio.productoId)?.push(precio);
    }
    return porProducto;
}

export async function conPrecios(productos: Producto[], transaction?: Transaction) {
    const vigentes = await preciosVigentes(productos.map(p => p.id), transaction);
    return productos.map(producto => ({
        ...producto.get({ plain: true }),
        precios: (vigentes.get(producto.id) || []).map(precio => precio.get({ plain: true })),
    }));
}
