import { Response } from 'express';
import { Op, Transaction, UniqueConstraintError, col, fn, where } from 'sequelize';
import { AuthRequest } from '../middlewares/auth.middleware';
import sequelize from '../config/database';
import Producto from '../models/Producto';
import PrecioProducto from '../models/PrecioProducto';
import { conPrecios } from '../services/producto.service';
import { ConflictoProducto, validarCambioPrecio, validarFiltrosProductos, validarProducto } from '../utils/producto.validation';
import { responderErrorProducto } from '../utils/producto.error';

function buscarDuplicado(nombre: string, transaction: Transaction, excluirId?: string) {
    return Producto.findOne({
        where: {
            [Op.and]: [
                where(fn('LOWER', col('nombre')), nombre.toLowerCase()),
                ...(excluirId ? [{ id: { [Op.ne]: excluirId } }] : []),
            ],
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });
}

async function asegurarNombreLibre(nombre: string, transaction: Transaction, excluirId?: string) {
    if (await buscarDuplicado(nombre, transaction, excluirId)) throw new UniqueConstraintError({ message: 'Ese producto ya existe' });
}

function bloquearProducto(id: string, transaction: Transaction) {
    return Producto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
}

export async function crearProducto(req: AuthRequest, res: Response) {
    try {
        const { precios, ...datos } = validarProducto(req.body, true);
        const producto = await sequelize.transaction(async transaction => {
            const existente = await buscarDuplicado(datos.nombre, transaction);
            if (existente?.activo) throw new UniqueConstraintError({ message: 'Ese producto ya existe' });
            const creado = existente
                ? await existente.update({ ...datos, activo: true }, { transaction })
                : await Producto.create(datos, { transaction });
            await PrecioProducto.bulkCreate([
                { productoId: creado.id, tipoCliente: 'particular', precio: precios.particular },
                { productoId: creado.id, tipoCliente: 'confianza', precio: precios.confianza },
            ], { transaction, validate: true });
            return (await conPrecios([creado], transaction))[0];
        });
        return res.status(201).json(producto);
    } catch (error) {
        return responderErrorProducto(res, error, 'Error al crear producto');
    }
}

export async function listarProductos(req: AuthRequest, res: Response) {
    try {
        const filtros = validarFiltrosProductos(req.query);
        const productos = await Producto.findAll({
            where: filtros.incluirInactivos ? {} : { activo: true },
            order: [['nombre', 'ASC']],
        });
        return res.json(await conPrecios(productos));
    } catch (error) {
        return responderErrorProducto(res, error, 'Error al listar productos');
    }
}

export async function cambiarPrecio(req: AuthRequest, res: Response) {
    try {
        const datos = validarCambioPrecio(req.body);
        const precio = await sequelize.transaction(async transaction => {
            const producto = await bloquearProducto(req.params.id as string, transaction);
            if (!producto) return null;
            if (!producto.activo) throw new ConflictoProducto('El producto esta desactivado; reactivarlo antes de cambiar el precio');
            return PrecioProducto.create({ productoId: producto.id, ...datos }, { transaction });
        });
        if (!precio) return res.status(404).json({ error: 'Producto no encontrado' });
        return res.status(201).json(precio);
    } catch (error) {
        return responderErrorProducto(res, error, 'Error al cambiar precio');
    }
}

export async function desactivarProducto(req: AuthRequest, res: Response) {
    try {
        const resultado = await sequelize.transaction(async transaction => {
            const producto = await bloquearProducto(req.params.id as string, transaction);
            if (!producto) return 'ausente';
            if (!producto.activo) return 'inactivo';
            await producto.update({ activo: false }, { transaction });
            return 'desactivado';
        });
        if (resultado === 'ausente') return res.status(404).json({ error: 'Producto no encontrado' });
        if (resultado === 'inactivo') return res.status(409).json({ error: 'El producto ya esta desactivado' });
        return res.status(204).send();
    } catch (error) {
        return responderErrorProducto(res, error, 'Error al desactivar producto');
    }
}

export async function actualizarProducto(req: AuthRequest, res: Response) {
    try {
        const datos = validarProducto(req.body, false);
        const producto = await sequelize.transaction(async transaction => {
            const actual = await bloquearProducto(req.params.id as string, transaction);
            if (!actual) return null;
            if (datos.nombre !== undefined) await asegurarNombreLibre(datos.nombre, transaction, actual.id);
            await actual.update(datos, { transaction });
            return (await conPrecios([actual], transaction))[0];
        });
        if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
        return res.json(producto);
    } catch (error) {
        return responderErrorProducto(res, error, 'Error al actualizar producto');
    }
}
