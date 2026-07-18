import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import Producto from '../models/Producto';
import PrecioProducto from '../models/PrecioProducto';

// Crear un producto (con su precio inicial para ambos tipos de cliente)
export async function crearProducto(req: AuthRequest, res: Response) {
    try {
        const { nombre, esRetornable, precioParticular, precioConfianza } = req.body;

        if (!nombre || precioParticular == null || precioConfianza == null) {
            return res.status(400).json({
                error: 'nombre, precioParticular y precioConfianza son obligatorios',
            });
        }

        const producto = await Producto.create({
            nombre,
            esRetornable: esRetornable ?? true,
        });

        // Creamos los precios iniciales para los 2 tipos de cliente
        await PrecioProducto.bulkCreate([
            { productoId: producto.id, tipoCliente: 'particular', precio: precioParticular },
            { productoId: producto.id, tipoCliente: 'confianza', precio: precioConfianza },
        ]);

        return res.status(201).json(producto);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al crear producto' });
    }
}

// Listar productos activos, con su precio vigente incluido
export async function listarProductos(req: AuthRequest, res: Response) {
    try {
        const productos = await Producto.findAll({
            where: { activo: true },
            include: [
                {
                    model: PrecioProducto,
                    as: 'precios',
                    separate: true, // permite ordenar el include de forma independiente
                    order: [['fechaDesde', 'DESC']],
                },
            ],
            order: [['nombre', 'ASC']],
        });

        return res.json(productos);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al listar productos' });
    }
}

// Cambiar el precio de un producto (INSERT, no UPDATE)
export async function cambiarPrecio(req: AuthRequest, res: Response) {
    try {
        const { id } = req.params; // id del producto
        const { tipoCliente, precio } = req.body;

        if (!tipoCliente || precio == null) {
            return res.status(400).json({ error: 'tipoCliente y precio son obligatorios' });
        }

        const producto = await Producto.findByPk(id as string);
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const nuevoPrecio = await PrecioProducto.create({
            productoId: id as string,
            tipoCliente,
            precio,
        });

        return res.status(201).json(nuevoPrecio);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al cambiar precio' });
    }
}

// Desactivar un producto (borrado lógico)
export async function desactivarProducto(req: AuthRequest, res: Response) {
    try {
        const { id } = req.params;
        const producto = await Producto.findByPk(id as string);

        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        await producto.update({ activo: false });
        return res.json(producto);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al desactivar producto' });
    }
}

export async function actualizarProducto(req: AuthRequest, res: Response) {
    try {
        const { id } = req.params;
        const { nombre, esRetornable, stockMinimo } = req.body;

        const producto = await Producto.findByPk(id as string);
        if (!producto) {
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        await producto.update({
            nombre: nombre ?? producto.nombre,
            esRetornable: esRetornable ?? producto.esRetornable,
            stockMinimo: stockMinimo ?? producto.stockMinimo,
        });

        return res.json(producto);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al actualizar producto' });
    }
}