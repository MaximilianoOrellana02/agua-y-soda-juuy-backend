import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import Pedido from "../models/Pedido";
import Cliente from "../models/Cliente";

export async function crearPedido(req: AuthRequest, res: Response) {
    try {
        const { clienteId, detalle } = req.body;
        if (!clienteId) {
            return res.status(400).json({
                error: "Cliente es obligatorio"
            })
        }

        const pedido = await Pedido.create({
            clienteId,
            detalle: detalle || null,
            usuarioId: req.usuario!.id
        })
        return res.status(201).json(pedido);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al crear el pedido' });
    }
}

export async function listarPedidosPendientes(req: AuthRequest, res: Response) {
    try {
        const pedidos = await Pedido.findAll({
            where: { estado: 'pendiente' },
            include: [{ model: Cliente, as: "cliente", attributes: ["id", "nombre", "apellido", "telefono"] }],
            order: [["fecha", "ASC"]]
        })

        return res.json(pedidos);
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Error interno al litar pedidos"
        })
    }
}

export async function marcarEntregado(req: AuthRequest, res: Response) {
    try {
        const { id } = req.params;
        const pedido = await Pedido.findByPk(id as string);
        if (!pedido) {
            return res.status(404).json({
                error: "Pedido no entrontrado"
            })
        }

        await pedido.update({
            estado: "entregado"
        })

        return res.json(pedido)
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Error interno al actualizar pedido"
        })
    }
}

export async function eliminarPedido(req: AuthRequest, res: Response) {
    try {
        const { id } = req.params
        const pedido = await Pedido.findByPk(id as string);
        if (!pedido) {
            return res.status(404).json({
                error: "Pedido no entrontrado"
            })
        }

        await pedido.destroy();
        return res.status(204).send()
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Error interno al eliminar pedido"
        })
    }
}
