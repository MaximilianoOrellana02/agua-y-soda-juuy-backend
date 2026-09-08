import { Response } from 'express';
import { ConnectionError, ForeignKeyConstraintError, ValidationError } from 'sequelize';
import { ConflictoPedido, DatosPedidoInvalidos } from './pedido.validation';

export function responderErrorPedido(res: Response, error: unknown, mensaje: string) {
    if (error instanceof DatosPedidoInvalidos) return res.status(400).json({ error: error.message });
    if (error instanceof ConflictoPedido) return res.status(409).json({ error: error.message });
    if (error instanceof ValidationError) return res.status(400).json({ error: error.errors[0]?.message || 'Datos de pedido invalidos' });
    if (error instanceof ForeignKeyConstraintError) return res.status(409).json({ error: 'El pedido entra en conflicto con datos relacionados' });
    console.error(mensaje, error instanceof Error ? error.name + ': ' + error.message : 'UnknownError');
    return res.status(error instanceof ConnectionError ? 503 : 500).json({ error: mensaje });
}
