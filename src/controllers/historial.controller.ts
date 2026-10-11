import { Response } from "express";
import { Transaction } from "sequelize";
import sequelize from "../config/database";
import { AuthRequest } from "../middlewares/auth.middleware";
import Cliente from "../models/Cliente";
import Producto from "../models/Producto";
import SaldoEnvase from "../models/SaldoEnvase";
import Historial from "../models/Historial";
import HistorialDetalle from "../models/HistorialDetalle";
import Usuario from "../models/Usuario";
import MovimientoStock from "../models/MovimientoStock";
import Pedido from "../models/Pedido";
import StockCamioneta from "../models/StockCamioneta";
import Camioneta from "../models/Camioneta";
import {
  bloquearCamioneta,
  bloquearStockCamioneta,
  camionetaDelDia,
} from "../services/stock-camioneta.service";
import { fechaComercial, rangoDiaComercial } from "../utils/fecha-comercial";
import { precioVigente } from "../services/producto.service";
import {
  ConflictoHistorial,
  DatosHistorialInvalidos,
  IMPORTE_MAXIMO,
  LIMITE_PAGINA_CLIENTE,
  RecursoHistorialAusente,
  redondear,
  validarEntrega,
  validarFiltrosHistorial,
  validarRangoFechas,
} from "../utils/historial.validation";
import { responderErrorHistorial } from "../utils/historial.error";
import { resumir, resumirCobrosPorMetodo, whereFecha } from "../services/resumen.service";

async function bloquearProductos(
  ids: string[],
  transaction: Transaction,
): Promise<Map<string, Producto>> {
  const productos = new Map<string, Producto>();
  for (const id of [...ids].sort()) {
    const producto = await Producto.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!producto)
      throw new RecursoHistorialAusente(`Producto ${id} no encontrado`);
    if (!producto.activo)
      throw new ConflictoHistorial(
        `El producto ${producto.nombre} esta desactivado`,
      );
    productos.set(id, producto);
  }
  return productos;
}

export async function crearEntrega(req: AuthRequest, res: Response) {
  try {
    const datos = validarEntrega(req.body);
    const resultado = await sequelize.transaction(async (transaction) => {
      const cliente = await Cliente.findByPk(datos.clienteId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!cliente) return null;
      const saldoGuardado = Number(cliente.saldoActual);
      if (
        datos.ajusteSaldo &&
        datos.ajusteSaldo.saldoEsperado !== saldoGuardado
      ) {
        throw new ConflictoHistorial(
          "El saldo del cliente cambio. Recarga la pagina y revisa la deuda anterior antes de confirmar.",
        );
      }
      const pedido = datos.pedidoId
        ? await Pedido.findByPk(datos.pedidoId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })
        : null;
      if (datos.pedidoId && !pedido) {
        throw new RecursoHistorialAusente("Pedido no encontrado");
      }
      if (pedido && pedido.clienteId !== cliente.id) {
        throw new ConflictoHistorial("El pedido pertenece a otro cliente");
      }
      if (pedido?.estado === "entregado") {
        throw new ConflictoHistorial("El pedido ya fue entregado");
      }
      // Sin camioneta la entrega descuenta del deposito; con camioneta, del stock de esa camioneta.
      let camionetaId = datos.camionetaId;
      if (camionetaId === undefined) {
        const usuario = await Usuario.findByPk(req.usuario!.id, { transaction });
        camionetaId = usuario ? camionetaDelDia(usuario) : null;
      }
      const camioneta = camionetaId
        ? await bloquearCamioneta(camionetaId, transaction)
        : null;
      if (camionetaId && !camioneta) {
        throw new RecursoHistorialAusente("Camioneta no encontrada");
      }
      if (camioneta && !camioneta.activa) {
        throw new ConflictoHistorial(`La camioneta ${camioneta.nombre} esta desactivada`);
      }
      // Orden de bloqueo igual al de las cargas: camioneta, productos, stock de la camioneta.
      const productos = await bloquearProductos(
        datos.detalles.map((d) => d.productoId),
        transaction,
      );
      const stockCamioneta = new Map<string, StockCamioneta>();
      if (camioneta) {
        for (const detalle of [...datos.detalles].sort((a, b) =>
          a.productoId.localeCompare(b.productoId),
        )) {
          if (detalle.cantidadEntregada > 0) {
            stockCamioneta.set(
              detalle.productoId,
              await bloquearStockCamioneta(camioneta.id, detalle.productoId, transaction),
            );
          }
        }
      }

      const lineas = [];
      for (const detalle of datos.detalles) {
        const producto = productos.get(detalle.productoId)!;
        if (detalle.cantidadEnvaseDevuelto && !producto.esRetornable) {
          throw new DatosHistorialInvalidos(
            `El producto ${producto.nombre} no es retornable y no admite envases devueltos`,
          );
        }
        const disponible = camioneta
          ? stockCamioneta.get(producto.id)?.cantidad ?? 0
          : producto.stockActual;
        if (detalle.cantidadEntregada > disponible) {
          throw new ConflictoHistorial(
            `Stock insuficiente de ${producto.nombre} en ${camioneta ? `la camioneta ${camioneta.nombre}` : "el deposito"}: hay ${disponible} y se intentan entregar ${detalle.cantidadEntregada}`,
          );
        }
        let precioUnitario = detalle.precioUnitario;
        if (precioUnitario === undefined) {
          const vigente = await precioVigente(
            producto.id,
            cliente.tipoCliente,
            transaction,
          );
          if (!vigente)
            throw new DatosHistorialInvalidos(
              `No hay precio cargado para el producto ${producto.nombre}`,
            );
          precioUnitario = vigente.precio;
        }
        lineas.push({
          ...detalle,
          producto,
          precioUnitario,
          importe: redondear(detalle.cantidadEntregada * precioUnitario),
        });
      }

      const importeTotal = redondear(
        lineas.reduce((total, linea) => total + linea.importe, 0),
      );
      const saldoAnterior = datos.ajusteSaldo?.saldoNuevo ?? saldoGuardado;
      const saldoFinal = redondear(
        saldoAnterior + importeTotal - datos.montoPagado,
      );
      if (Math.abs(saldoFinal) > IMPORTE_MAXIMO) {
        throw new DatosHistorialInvalidos(
          "El saldo final supera el limite permitido",
        );
      }
      const historial = await Historial.create(
        {
          clienteId: cliente.id,
          usuarioId: req.usuario!.id,
          camionetaId: camioneta?.id ?? null,
          saldoAnterior,
          importeTotal,
          montoPagado: datos.montoPagado,
          saldoFinal,
          observacion: datos.observacion,
          metodoPago: datos.metodoPago,
          ajusteSaldo: datos.ajusteSaldo ?? null,
        },
        { transaction },
      );

      const detalles = [];
      for (const linea of lineas) {
        const {
          producto,
          cantidadEntregada,
          cantidadEnvaseDevuelto,
          precioUnitario,
          importe,
        } = linea;
        detalles.push(
          await HistorialDetalle.create(
            {
              historialId: historial.id,
              productoId: producto.id,
              cantidadEntregada,
              cantidadEnvaseDevuelto,
              precioUnitario,
              importe,
            },
            { transaction },
          ),
        );
        // Solo los productos retornables generan deuda de envases.
        if (producto.esRetornable) {
          const [saldoEnvase] = await SaldoEnvase.findOrCreate({
            where: { clienteId: cliente.id, productoId: producto.id },
            defaults: {
              clienteId: cliente.id,
              productoId: producto.id,
              cantidad: 0,
            },
            transaction,
          });
          await saldoEnvase.update(
            {
              cantidad:
                saldoEnvase.cantidad +
                cantidadEntregada -
                cantidadEnvaseDevuelto,
            },
            { transaction },
          );
        }
        // Si la linea solo devuelve envases no hay salida de stock que registrar.
        if (cantidadEntregada > 0) {
          await MovimientoStock.create(
            {
              productoId: producto.id,
              usuarioId: req.usuario!.id,
              camionetaId: camioneta?.id ?? null,
              tipo: "salida",
              cantidad: cantidadEntregada,
              motivo: "Entrega a cliente",
            },
            { transaction },
          );
          if (camioneta) {
            await stockCamioneta.get(producto.id)!.increment("cantidad", {
              by: -cantidadEntregada,
              transaction,
            });
          } else {
            await producto.increment("stockActual", {
              by: -cantidadEntregada,
              transaction,
            });
          }
        }
      }

      await cliente.update(
        { saldoActual: saldoFinal, ultimaVisitaFecha: fechaComercial() },
        { transaction },
      );
      if (pedido) {
        await pedido.update({ estado: "entregado" }, { transaction });
      }
      return { historial, detalles };
    });
    if (!resultado)
      return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(201).json(resultado);
  } catch (error) {
    return responderErrorHistorial(res, error, "Error al registrar la entrega");
  }
}

export async function historialPorCliente(req: AuthRequest, res: Response) {
  try {
    const clienteId = req.params.clienteId as string;
    const filtros = validarFiltrosHistorial(
      req.query,
      LIMITE_PAGINA_CLIENTE,
      100,
    );
    if (!(await Cliente.findByPk(clienteId, { paranoid: false })))
      return res.status(404).json({ error: "Cliente no encontrado" });
    const { rows, count } = await Historial.findAndCountAll({
      where: { clienteId, ...whereFecha(filtros) },
      include: [
        {
          model: HistorialDetalle,
          as: "detalles",
          include: [
            { model: Producto, as: "producto", attributes: ["id", "nombre"] },
          ],
        },
      ],
      order: [
        ["fecha", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: filtros.limit,
      offset: (filtros.page - 1) * filtros.limit,
      distinct: true,
    });
    res.setHeader("X-Total-Historial", String(count));
    return res.json(rows);
  } catch (error) {
    return responderErrorHistorial(res, error, "Error al obtener historial");
  }
}

export async function listarHistorial(req: AuthRequest, res: Response) {
  try {
    const filtros = validarFiltrosHistorial(req.query);
    const { rows, count } = await Historial.findAndCountAll({
      where: whereFecha(filtros),
      include: [
        {
          model: Cliente,
          as: "cliente",
          attributes: ["id", "nombre", "apellido"],
          paranoid: false,
        },
        { model: Usuario, as: "usuario", attributes: ["id", "nombreCompleto"] },
        { model: Camioneta, as: "camioneta", attributes: ["id", "nombre"] },
      ],
      order: [
        ["fecha", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: filtros.limit,
      offset: (filtros.page - 1) * filtros.limit,
    });
    return res.json({
      data: rows,
      total: count,
      page: filtros.page,
      totalPages: Math.ceil(count / filtros.limit),
    });
  } catch (error) {
    return responderErrorHistorial(res, error, "Error al listar historial");
  }
}

export async function resumenHistorial(req: AuthRequest, res: Response) {
  try {
    return res.json(await resumir(validarRangoFechas(req.query)));
  } catch (error) {
    return responderErrorHistorial(res, error, "Error al obtener el resumen");
  }
}

export async function resumenHoy(req: AuthRequest, res: Response) {
  try {
    const { inicio, fin } = rangoDiaComercial(fechaComercial());
    const rango = { desde: inicio, hasta: fin };
    const [resumen, cobradoPorMetodo] = await Promise.all([
      resumir(rango),
      resumirCobrosPorMetodo(rango),
    ]);
    return res.json({
      fecha: fechaComercial(),
      cobrado: resumen.totalPagado,
      cobradoPorMetodo,
      entregasCount: resumen.cantidadEntregas,
      entregados: resumen.productos.reduce((total, p) => total + p.cantidad, 0),
      devueltos: resumen.productos.reduce((total, p) => total + p.devueltos, 0),
      productos: resumen.productos,
    });
  } catch (error) {
    return responderErrorHistorial(
      res,
      error,
      "Error al obtener el resumen del dia",
    );
  }
}
