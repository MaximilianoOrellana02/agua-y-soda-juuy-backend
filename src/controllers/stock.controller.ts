import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import sequelize from "../config/database";
import Producto from "../models/Producto";
import MovimientoStock from "../models/MovimientoStock";
import Usuario from "../models/Usuario";
import { Op } from "sequelize";

export async function crearMovimientoStock(req: AuthRequest, res: Response) {
    const t = await sequelize.transaction();

    try {
        const { productoId, tipo, cantidad, motivo } = req.body;

        if (!productoId || !tipo || !cantidad || cantidad <= 0) {
            await t.rollback();
            return res.status(400).json({ error: 'Datos incompletos o inválidos' });
        }

        if (tipo === 'salida' && !motivo) {
            await t.rollback();
            return res.status(400).json({ error: 'El motivo es obligatorio para una salida' });
        }

        const producto = await Producto.findByPk(productoId, { transaction: t });
        if (!producto) {
            await t.rollback();
            return res.status(404).json({ error: 'Producto no encontrado' });
        }

        const movimiento = await MovimientoStock.create(
            {
                productoId,
                usuarioId: req.usuario!.id,
                tipo,
                cantidad,
                motivo: motivo ?? null,
            },
            { transaction: t }
        );

        if (tipo === 'entrada') {
            await producto.increment('stockActual', { by: cantidad, transaction: t });
        } else {
            await producto.decrement('stockActual', { by: cantidad, transaction: t });
        }

        await t.commit();
        return res.status(201).json(movimiento);
    } catch (error) {
        await t.rollback();
        console.error(error);
        return res.status(500).json({ error: 'Error al registrar el movimiento' });
    }
}

export async function listarMovimientosStock(req: AuthRequest, res: Response) {
    try {
        const { productoId, tipo, desde, hasta } = req.query as Record<string, string>;

        const where: any = {};
        if (productoId) where.productoId = productoId;
        if (tipo) where.tipo = tipo;
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha[Op.gte] = new Date(desde);
            if (hasta) where.fecha[Op.lte] = new Date(hasta);
        }

        const movimientos = await MovimientoStock.findAll({
            where,
            include: [
                { model: Producto, as: 'producto', attributes: ['id', 'nombre'] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
            ],
            order: [['fecha', 'DESC']],
            limit: 1000,
        });

        return res.json(movimientos);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al listar movimientos' });
    }
}