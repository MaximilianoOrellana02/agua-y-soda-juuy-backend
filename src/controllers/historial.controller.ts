import { Response } from 'express';
import { col, fn, Op } from 'sequelize';
import sequelize from '../config/database';
import { AuthRequest } from '../middlewares/auth.middleware';
import Cliente from '../models/Cliente';
import Producto from '../models/Producto';
import PrecioProducto from '../models/PrecioProducto';
import SaldoEnvase from '../models/SaldoEnvase';
import Historial from '../models/Historial';
import HistorialDetalle from '../models/HistorialDetalle';
import Usuario from '../models/Usuario';
import MovimientoStock from '../models/MovimientoStock';

interface DetalleInput {
    productoId: string;
    cantidadEntregada: number;
    cantidadEnvaseDevuelto?: number;
    precioUnitario?: number; // opcional: si no viene, se busca el precio vigente
}

export async function crearEntrega(req: AuthRequest, res: Response) {
    const t = await sequelize.transaction(); // arrancamos la transacción

    try {
        const { clienteId, montoPagado, observacion, detalles, metodoPago } = req.body as {
            clienteId: string;
            montoPagado?: number;
            observacion?: string;
            detalles: DetalleInput[];
            metodoPago?: 'efectivo' | 'transferencia'
        };

        const hayDetalles = detalles && detalles.length > 0;
        const hayPago = montoPagado != null && montoPagado > 0;

        if (!clienteId || (!hayDetalles && !hayPago)) {
            await t.rollback();
            return res.status(400).json({ error: 'Tenés que cargar al menos un producto o un monto pagado' });
        }

        // 1. Buscar el cliente (bloqueado para esta transacción, evita condiciones de carrera)
        const cliente = await Cliente.findByPk(clienteId, { transaction: t, lock: true });
        if (!cliente) {
            await t.rollback();
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        let importeTotal = 0;
        const detallesParaCrear: any[] = [];

        // 2. Recorremos cada línea del detalle
        for (const linea of detalles ?? []) {
            const producto = await Producto.findByPk(linea.productoId, { transaction: t });
            if (!producto) {
                await t.rollback();
                return res.status(404).json({ error: `Producto ${linea.productoId} no encontrado` });
            }

            const cantidadEnvaseDevuelto = linea.cantidadEnvaseDevuelto ?? 0;



            let precioUnitario = linea.precioUnitario;

            // Si no vino precio manual, buscamos el vigente según tipo de cliente
            if (precioUnitario == null) {
                const precioVigente = await PrecioProducto.findOne({
                    where: { productoId: linea.productoId, tipoCliente: cliente.tipoCliente },
                    order: [['fechaDesde', 'DESC']],
                    transaction: t,
                });

                if (!precioVigente) {
                    await t.rollback();
                    return res.status(400).json({
                        error: `No hay precio cargado para el producto ${producto.nombre}`,
                    });
                }
                precioUnitario = Number(precioVigente.precio);
            }

            const importe = linea.cantidadEntregada * precioUnitario;
            importeTotal += importe;

            detallesParaCrear.push({
                productoId: linea.productoId,
                cantidadEntregada: linea.cantidadEntregada,
                cantidadEnvaseDevuelto,
                precioUnitario,
                importe,
            });
        }

        // 3. Calcular saldos
        const saldoAnterior = Number(cliente.saldoActual);
        const montoPagadoFinal = montoPagado ?? 0;
        const saldoFinal = saldoAnterior + importeTotal - montoPagadoFinal;

        // 4. Crear la cabecera del historial
        const historial = await Historial.create(
            {
                clienteId,
                usuarioId: req.usuario!.id,
                saldoAnterior,
                importeTotal,
                montoPagado: montoPagadoFinal,
                saldoFinal,
                observacion: observacion ?? null,
                metodoPago: metodoPago ?? 'efectivo',
            },
            { transaction: t }
        );

        // 5. Crear las líneas de detalle, ligadas al historial recién creado
        for (const d of detallesParaCrear) {
            await HistorialDetalle.create(
                { ...d, historialId: historial.id },
                { transaction: t }
            );

            // 6. Actualizar (o crear) el saldo de envases de ese producto para el cliente
            const [saldoEnvase, creado] = await SaldoEnvase.findOrCreate({
                where: { clienteId, productoId: d.productoId },
                defaults: { clienteId, productoId: d.productoId, cantidad: 0 },
                transaction: t,
            });

            const diferencia = d.cantidadEntregada - d.cantidadEnvaseDevuelto;
            await saldoEnvase.update(
                { cantidad: saldoEnvase.cantidad + diferencia },
                { transaction: t }
            );

            // 6.5. Descontar del stock del depósito y dejar registro del movimiento
            await MovimientoStock.create(
                {
                    productoId: d.productoId,
                    usuarioId: req.usuario!.id,
                    tipo: 'salida',
                    cantidad: d.cantidadEntregada,
                    motivo: 'Entrega a cliente',
                },
                { transaction: t }
            );
            await Producto.decrement('stockActual', {
                by: d.cantidadEntregada,
                where: { id: d.productoId },
                transaction: t,
            });
        }

        // 7. Actualizar el saldo del cliente y marcarlo como visitado hoy
        const hoy = new Date().toISOString().split('T')[0];
        await cliente.update({ saldoActual: saldoFinal, ultimaVisitaFecha: hoy }, { transaction: t });
        await t.commit();

        return res.status(201).json({ historial, detalles: detallesParaCrear });
    } catch (error) {
        await t.rollback(); // si algo falla, deshacemos TODO lo que se hizo en esta transacción
        console.error(error);
        return res.status(500).json({ error: 'Error al registrar la entrega' });
    }
}

// Ver el historial de un cliente puntual
export async function historialPorCliente(req: AuthRequest, res: Response) {
    try {
        const { clienteId } = req.params;

        const historiales = await Historial.findAll({
            where: { clienteId },
            include: [
                {
                    model: HistorialDetalle,
                    as: 'detalles',
                    include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre'] }],
                },
            ],
            order: [['fecha', 'DESC']],
        });

        return res.json(historiales);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al obtener historial' });
    }
}

export async function listarHistorial(req: AuthRequest, res: Response) {
    try {
        const { desde, hasta, page = '1', limit = '20' } = req.query as Record<string, string>;

        const where: any = {};
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha[Op.gte] = new Date(desde);
            if (hasta) where.fecha[Op.lte] = new Date(hasta);
        }

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, parseInt(limit));
        const offset = (pageNum - 1) * limitNum;

        const { rows, count } = await Historial.findAndCountAll({
            where,
            include: [
                { model: Cliente, as: 'cliente', attributes: ['id', 'nombre', 'apellido'] },
                { model: Usuario, as: 'usuario', attributes: ['id', 'nombreCompleto'] },
            ],
            order: [['fecha', 'DESC']],
            limit: limitNum,
            offset,
        });

        return res.json({
            data: rows,
            total: count,
            page: pageNum,
            totalPages: Math.ceil(count / limitNum),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al listar historial' });
    }
}

export async function resumenHistorial(req: AuthRequest, res: Response) {
    try {
        const { desde, hasta } = req.query as Record<string, string>;

        const where: any = {};
        if (desde || hasta) {
            where.fecha = {};
            if (desde) where.fecha[Op.gte] = new Date(desde);
            if (hasta) where.fecha[Op.lte] = new Date(hasta);
        }

        // Totales generales (cantidad de entregas, facturado, cobrado)
        const totales = await Historial.findOne({
            where,
            attributes: [
                [fn('COUNT', col('id')), 'cantidadEntregas'],
                [fn('SUM', col('importeTotal')), 'totalImporte'],
                [fn('SUM', col('montoPagado')), 'totalPagado'],
            ],
            raw: true,
        });

        // Desglose de cantidades entregadas, agrupado por producto
        const detalles = await HistorialDetalle.findAll({
            include: [
                { model: Historial, as: 'historial', attributes: [], where },
                { model: Producto, as: 'producto', attributes: ['nombre'] },
            ],
            attributes: [[fn('SUM', col('cantidadEntregada')), 'cantidad']],
            group: ['producto.id', 'producto.nombre'],
            raw: true,
        });

        const totalImporte = Number((totales as any)?.totalImporte ?? 0);
        const totalPagado = Number((totales as any)?.totalPagado ?? 0);

        return res.json({
            cantidadEntregas: Number((totales as any)?.cantidadEntregas ?? 0),
            totalImporte,
            totalPagado,
            totalPendiente: totalImporte - totalPagado,
            productos: detalles.map((d: any) => ({
                nombre: d['producto.nombre'],
                cantidad: Number(d.cantidad),
            })),
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al obtener el resumen' });
    }
}