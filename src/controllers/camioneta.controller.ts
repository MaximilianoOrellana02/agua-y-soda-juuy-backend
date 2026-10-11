import { Response } from "express";
import { Transaction } from "sequelize";
import sequelize from "../config/database";
import { AuthRequest } from "../middlewares/auth.middleware";
import Camioneta from "../models/Camioneta";
import MovimientoStock from "../models/MovimientoStock";
import Producto from "../models/Producto";
import StockCamioneta from "../models/StockCamioneta";
import Usuario from "../models/Usuario";
import {
  bloquearCamioneta,
  bloquearStockCamioneta,
  camionetaDelDia,
} from "../services/stock-camioneta.service";
import {
  MovimientoCamionetaInput,
  validarCamioneta,
  validarCargaCamioneta,
  validarMovimientoCamioneta,
} from "../utils/camioneta.validation";
import { fechaComercial } from "../utils/fecha-comercial";
import { ConflictoStock } from "../utils/stock.validation";
import { responderErrorStock } from "../utils/stock.error";
import { sincronizarCamionetaDelReparto } from "./reparto.controller";

export async function listarCamionetas(req: AuthRequest, res: Response) {
  try {
    const incluirInactivas = req.query.incluirInactivas === "true";
    const camionetas = await Camioneta.findAll({
      where: incluirInactivas ? {} : { activa: true },
      order: [["nombre", "ASC"]],
    });
    return res.json(camionetas);
  } catch (error) {
    return responderErrorStock(res, error, "Error al listar camionetas");
  }
}

export async function crearCamioneta(req: AuthRequest, res: Response) {
  try {
    const datos = validarCamioneta(req.body, true);
    const camioneta = await Camioneta.create({
      nombre: datos.nombre!,
      patente: datos.patente ?? null,
      activa: datos.activa ?? true,
    });
    return res.status(201).json(camioneta);
  } catch (error) {
    return responderErrorStock(res, error, "Error al crear la camioneta");
  }
}

export async function actualizarCamioneta(req: AuthRequest, res: Response) {
  try {
    const datos = validarCamioneta(req.body, false);
    const camioneta = await Camioneta.findByPk(req.params.id as string);
    if (!camioneta)
      return res.status(404).json({ error: "Camioneta no encontrada" });
    await camioneta.update(datos);
    return res.json(camioneta);
  } catch (error) {
    return responderErrorStock(res, error, "Error al actualizar la camioneta");
  }
}

export async function stockDeCamioneta(req: AuthRequest, res: Response) {
  try {
    const camioneta = await Camioneta.findByPk(req.params.id as string);
    if (!camioneta)
      return res.status(404).json({ error: "Camioneta no encontrada" });
    const stock = await StockCamioneta.findAll({
      where: { camionetaId: camioneta.id },
      include: [
        {
          model: Producto,
          as: "producto",
          attributes: ["id", "nombre", "esRetornable", "activo"],
        },
      ],
      order: [[{ model: Producto, as: "producto" }, "nombre", "ASC"]],
    });
    return res.json({ camioneta, stock });
  } catch (error) {
    return responderErrorStock(res, error, "Error al obtener el stock");
  }
}

// El repartidor elige con que camioneta sale hoy; sus entregas descuentan de ese stock.
export async function elegirCamioneta(req: AuthRequest, res: Response) {
  try {
    const camioneta = await Camioneta.findByPk(req.params.id as string);
    if (!camioneta)
      return res.status(404).json({ error: "Camioneta no encontrada" });
    if (!camioneta.activa)
      throw new ConflictoStock("La camioneta esta desactivada");
    await Usuario.update(
      { camionetaActivaId: camioneta.id, camionetaActivaFecha: fechaComercial() },
      { where: { id: req.usuario!.id } },
    );
    await sincronizarCamionetaDelReparto(req.usuario!.id, camioneta.id);
    return res.json({ camioneta, fecha: fechaComercial() });
  } catch (error) {
    return responderErrorStock(res, error, "Error al elegir la camioneta");
  }
}

// "Hoy no uso camioneta": las entregas vuelven a descontar del deposito.
export async function dejarCamioneta(req: AuthRequest, res: Response) {
  try {
    await Usuario.update(
      { camionetaActivaId: null, camionetaActivaFecha: null },
      { where: { id: req.usuario!.id } },
    );
    await sincronizarCamionetaDelReparto(req.usuario!.id, null);
    return res.json({ camioneta: null, fecha: fechaComercial() });
  } catch (error) {
    return responderErrorStock(res, error, "Error al dejar la camioneta");
  }
}

export async function miCamioneta(req: AuthRequest, res: Response) {
  try {
    const usuario = await Usuario.findByPk(req.usuario!.id);
    const id = usuario ? camionetaDelDia(usuario) : null;
    const camioneta = id ? await Camioneta.findByPk(id) : null;
    return res.json({ camioneta, fecha: fechaComercial() });
  } catch (error) {
    return responderErrorStock(res, error, "Error al obtener la camioneta");
  }
}

// Aplica un movimiento sobre una camioneta y un producto ya bloqueados.
// Carga: suma a la camioneta y, si afectaStockGeneral, la mercaderia sale del deposito.
// Descarga: resta de la camioneta y, si afectaStockGeneral, vuelve al deposito (si no, es merma/rotura).
async function aplicarMovimiento(
  camioneta: Camioneta,
  producto: Producto,
  datos: MovimientoCamionetaInput,
  usuarioId: string,
  transaction: Transaction,
) {
  const stock = await bloquearStockCamioneta(camioneta.id, producto.id, transaction);
  const esCarga = datos.tipo === "carga";
  if (esCarga && datos.afectaStockGeneral && producto.stockActual < datos.cantidad) {
    throw new ConflictoStock(
      `Stock insuficiente de ${producto.nombre} en el deposito: hay ${producto.stockActual} y se intentan cargar ${datos.cantidad}`,
    );
  }
  if (!esCarga && stock.cantidad < datos.cantidad) {
    throw new ConflictoStock(
      `Stock insuficiente de ${producto.nombre} en la camioneta: hay ${stock.cantidad} y se intentan descargar ${datos.cantidad}`,
    );
  }

  const movimientos = [
    await MovimientoStock.create(
      {
        productoId: producto.id,
        usuarioId,
        camionetaId: camioneta.id,
        tipo: esCarga ? "entrada" : "salida",
        cantidad: datos.cantidad,
        motivo: datos.motivo ?? (esCarga ? "Carga de camioneta" : "Descarga de camioneta"),
      },
      { transaction },
    ),
  ];
  await stock.increment("cantidad", {
    by: esCarga ? datos.cantidad : -datos.cantidad,
    transaction,
  });
  if (datos.afectaStockGeneral) {
    movimientos.push(
      await MovimientoStock.create(
        {
          productoId: producto.id,
          usuarioId,
          camionetaId: null,
          tipo: esCarga ? "salida" : "entrada",
          cantidad: datos.cantidad,
          motivo: esCarga
            ? `Carga a camioneta ${camioneta.nombre}`
            : `Descarga de camioneta ${camioneta.nombre}`,
        },
        { transaction },
      ),
    );
    await producto.increment("stockActual", {
      by: esCarga ? -datos.cantidad : datos.cantidad,
      transaction,
    });
  }
  await stock.reload({ transaction });
  await producto.reload({ transaction });
  return {
    productoId: producto.id,
    movimientos,
    stockCamioneta: stock.cantidad,
    stockGeneral: producto.stockActual,
  };
}

async function bloquearCamionetaActiva(id: string, transaction: Transaction) {
  const camioneta = await bloquearCamioneta(id, transaction);
  if (camioneta && !camioneta.activa)
    throw new ConflictoStock("La camioneta esta desactivada");
  return camioneta;
}

async function bloquearProductoActivo(id: string, transaction: Transaction) {
  const producto = await Producto.findByPk(id, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (producto && !producto.activo)
    throw new ConflictoStock(`El producto ${producto.nombre} esta desactivado y no admite movimientos`);
  return producto;
}

export async function moverStockCamioneta(req: AuthRequest, res: Response) {
  try {
    const datos = validarMovimientoCamioneta(req.body);
    const resultado = await sequelize.transaction(async (transaction) => {
      const camioneta = await bloquearCamionetaActiva(req.params.id as string, transaction);
      if (!camioneta) return { error: "Camioneta no encontrada" };
      const producto = await bloquearProductoActivo(datos.productoId, transaction);
      if (!producto) return { error: "Producto no encontrado" };
      return aplicarMovimiento(camioneta, producto, datos, req.usuario!.id, transaction);
    });
    if ("error" in resultado) return res.status(404).json(resultado);
    return res.status(201).json(resultado);
  } catch (error) {
    return responderErrorStock(res, error, "Error al mover stock de la camioneta");
  }
}

// Carga de varios productos de una vez (al empezar el reparto): se aplican todos o ninguno.
export async function cargarCamioneta(req: AuthRequest, res: Response) {
  try {
    const datos = validarCargaCamioneta(req.body);
    const resultado = await sequelize.transaction(async (transaction) => {
      const camioneta = await bloquearCamionetaActiva(req.params.id as string, transaction);
      if (!camioneta) return { error: "Camioneta no encontrada" };
      // Mismo orden de bloqueo que las entregas: productos por id, despues su stock en la camioneta.
      const items = [...datos.items].sort((a, b) => a.productoId.localeCompare(b.productoId));
      const productos = new Map<string, Producto>();
      for (const item of items) {
        const producto = await bloquearProductoActivo(item.productoId, transaction);
        if (!producto) return { error: `Producto ${item.productoId} no encontrado` };
        productos.set(item.productoId, producto);
      }
      const lineas = [];
      for (const item of items) {
        lineas.push(
          await aplicarMovimiento(
            camioneta,
            productos.get(item.productoId)!,
            { ...item, tipo: "carga", motivo: datos.motivo, afectaStockGeneral: datos.afectaStockGeneral },
            req.usuario!.id,
            transaction,
          ),
        );
      }
      return { afectaStockGeneral: datos.afectaStockGeneral, lineas };
    });
    if ("error" in resultado) return res.status(404).json(resultado);
    return res.status(201).json(resultado);
  } catch (error) {
    return responderErrorStock(res, error, "Error al cargar la camioneta");
  }
}
