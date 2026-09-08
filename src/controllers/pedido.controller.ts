import { Response } from "express";
import { WhereOptions } from "sequelize";
import { AuthRequest } from "../middlewares/auth.middleware";
import Pedido from "../models/Pedido";
import Cliente from "../models/Cliente";
import sequelize from '../config/database';
import { ConflictoPedido, LIMITE_PEDIDOS, validarFiltrosPedidos, validarPedido } from '../utils/pedido.validation';
import { responderErrorPedido } from '../utils/pedido.error';

const CLIENTE_DEL_PEDIDO = { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'apellido', 'telefono'], paranoid: false };

export async function crearPedido(req: AuthRequest, res: Response) {
    try {
        // Se valida antes de abrir la transaccion para no gastar conexiones en requests invalidos.
        const datos = validarPedido(req.body);
        const pedido = await sequelize.transaction(async transaction => {
            // El lock coordina con la baja logica del cliente: no se crean pedidos pendientes para clientes archivados.
            const cliente = await Cliente.findByPk(datos.clienteId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!cliente) return null;
            return Pedido.create({ ...datos, usuarioId: req.usuario!.id }, { transaction });
        });
        if (!pedido) return res.status(404).json({ error: 'Cliente no encontrado' });
        return res.status(201).json(pedido);
    } catch (error) {
        return responderErrorPedido(res, error, 'Error al crear el pedido');
    }
}

// Sin filtros lista los pendientes, del mas antiguo al mas nuevo. ?estado=entregado o ?estado=todos amplian el
// listado (del mas nuevo al mas antiguo) y ?clienteId=<uuid> lo acota a un cliente.
export async function listarPedidos(req: AuthRequest, res: Response) {
    try {
        const filtros = validarFiltrosPedidos(req.query);
        const where: WhereOptions = {};
        if (filtros.estado) Object.assign(where, { estado: filtros.estado });
        if (filtros.clienteId) Object.assign(where, { clienteId: filtros.clienteId });
        const direccion = filtros.estado === 'pendiente' ? 'ASC' : 'DESC';
        const pedidos = await Pedido.findAll({
            where,
            include: [CLIENTE_DEL_PEDIDO],
            order: [['fecha', direccion], ['createdAt', direccion]],
            limit: LIMITE_PEDIDOS,
        });
        // El cliente puede saber si la lista fue recortada y acotar por estado o cliente.
        res.setHeader('X-Limite-Pedidos', String(LIMITE_PEDIDOS));
        return res.json(pedidos);
    } catch (error) {
        return responderErrorPedido(res, error, 'Error al listar pedidos');
    }
}

// Mantiene el nombre historico usado por las rutas.
export const listarPedidosPendientes = listarPedidos;

export async function marcarEntregado(req: AuthRequest, res: Response) {
    try {
        const pedido = await sequelize.transaction(async transaction => {
            const actual = await Pedido.findByPk(req.params.id as string, { transaction, lock: transaction.LOCK.UPDATE });
            if (!actual) return null;
            if (actual.estado === 'entregado') throw new ConflictoPedido('El pedido ya fue entregado');
            return actual.update({ estado: 'entregado' }, { transaction });
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
        return res.json(pedido);
    } catch (error) {
        return responderErrorPedido(res, error, 'Error al actualizar pedido');
    }
}

// Solo se eliminan pedidos pendientes: los entregados forman parte del historial del cliente.
export async function eliminarPedido(req: AuthRequest, res: Response) {
    try {
        const resultado = await sequelize.transaction(async transaction => {
            const pedido = await Pedido.findByPk(req.params.id as string, { transaction, lock: transaction.LOCK.UPDATE });
            if (!pedido) return 'ausente';
            if (pedido.estado === 'entregado') return 'entregado';
            await pedido.destroy({ transaction });
            return 'borrado';
        });
        if (resultado === 'ausente') return res.status(404).json({ error: 'Pedido no encontrado' });
        if (resultado === 'entregado') return res.status(409).json({ error: 'Un pedido entregado forma parte del historial y no se elimina' });
        return res.status(204).send();
    } catch (error) {
        return responderErrorPedido(res, error, 'Error al eliminar pedido');
    }
}
