import { Response } from "express";
import { Op, UniqueConstraintError } from "sequelize";
import { AuthRequest } from "../middlewares/auth.middleware";
import Camioneta from "../models/Camioneta";
import MovimientoStock from "../models/MovimientoStock";
import Producto from "../models/Producto";
import Reparto from "../models/Reparto";
import StockCamioneta from "../models/StockCamioneta";
import Usuario from "../models/Usuario";
import { resumir, resumirCobrosPorMetodo } from "../services/resumen.service";
import { camionetaDelDia } from "../services/stock-camioneta.service";
import { fechaComercial, rangoDiaComercial } from "../utils/fecha-comercial";
import { ConflictoStock } from "../utils/stock.validation";
import { responderErrorStock } from "../utils/stock.error";

const conCamioneta = { include: [{ model: Camioneta, as: "camioneta", attributes: ["id", "nombre", "patente"] }] };

function buscarRepartoDeHoy(usuarioId: string) {
  return Reparto.findOne({ where: { usuarioId, fecha: fechaComercial() }, ...conCamioneta });
}

// Resumen del reparto: entregas y cobros del repartidor en el día (hasta que terminó) y cómo quedó la camioneta.
export async function resumenDelReparto(reparto: Reparto) {
  const { inicio, fin } = rangoDiaComercial(reparto.fecha);
  const filtro = { desde: inicio, hasta: reparto.finalizadoEn ?? fin, usuarioId: reparto.usuarioId };
  const [entregas, cobradoPorMetodo] = await Promise.all([resumir(filtro), resumirCobrosPorMetodo(filtro)]);

  let camioneta = null;
  if (reparto.camionetaId) {
    const [stock, cargas] = await Promise.all([
      StockCamioneta.findAll({
        where: { camionetaId: reparto.camionetaId },
        include: [{ model: Producto, as: "producto", attributes: ["nombre"] }],
      }),
      MovimientoStock.findAll({
        where: { camionetaId: reparto.camionetaId, tipo: "entrada", fecha: { [Op.between]: [inicio, fin] } },
        attributes: ["productoId", "cantidad"],
        include: [{ model: Producto, as: "producto", attributes: ["nombre"] }],
      }),
    ]);
    const porProducto = new Map<string, { nombre: string; cargado: number; queda: number }>();
    const fila = (id: string, nombre: string) => {
      if (!porProducto.has(id)) porProducto.set(id, { nombre, cargado: 0, queda: 0 });
      return porProducto.get(id)!;
    };
    for (const c of cargas) fila(c.productoId, (c as any).producto?.nombre ?? "").cargado += c.cantidad;
    for (const s of stock) fila(s.productoId, (s as any).producto?.nombre ?? "").queda = s.cantidad;
    camioneta = [...porProducto.values()]
      .filter((p) => p.cargado > 0 || p.queda > 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  return {
    fecha: reparto.fecha,
    iniciadoEn: reparto.iniciadoEn,
    finalizadoEn: reparto.finalizadoEn,
    camioneta: (reparto as any).camioneta ?? null,
    entregas: entregas.cantidadEntregas,
    totalVendido: entregas.totalImporte,
    cobrado: entregas.totalPagado,
    cobradoPorMetodo,
    fiado: entregas.totalPendiente,
    productos: entregas.productos,
    stockCamioneta: camioneta,
  };
}

export async function repartoDeHoy(req: AuthRequest, res: Response) {
  try {
    const reparto = await buscarRepartoDeHoy(req.usuario!.id);
    return res.json({
      reparto,
      resumen: reparto?.finalizadoEn ? await resumenDelReparto(reparto) : null,
    });
  } catch (error) {
    return responderErrorStock(res, error, "Error al obtener el reparto de hoy");
  }
}

// Empieza el reparto de hoy con la camioneta que el usuario eligió (o sin camioneta). Repetirlo no duplica nada.
export async function comenzarReparto(req: AuthRequest, res: Response) {
  try {
    const usuario = await Usuario.findByPk(req.usuario!.id);
    if (!usuario) return res.status(401).json({ error: "Usuario no encontrado" });
    const camionetaId = camionetaDelDia(usuario);
    let reparto = await buscarRepartoDeHoy(usuario.id);
    if (reparto?.finalizadoEn) throw new ConflictoStock("El reparto de hoy ya terminó");
    if (reparto) {
      if (reparto.camionetaId !== camionetaId) await reparto.update({ camionetaId });
    } else {
      try {
        await Reparto.create({ usuarioId: usuario.id, fecha: fechaComercial(), camionetaId });
      } catch (error) {
        // Dos pedidos a la vez (doble toque): el otro ya lo creó.
        if (!(error instanceof UniqueConstraintError)) throw error;
      }
    }
    reparto = await buscarRepartoDeHoy(usuario.id);
    return res.status(201).json(reparto);
  } catch (error) {
    return responderErrorStock(res, error, "Error al comenzar el reparto");
  }
}

export async function terminarReparto(req: AuthRequest, res: Response) {
  try {
    const reparto = await buscarRepartoDeHoy(req.usuario!.id);
    if (!reparto) return res.status(404).json({ error: "Todavía no comenzaste el reparto de hoy" });
    if (reparto.finalizadoEn) throw new ConflictoStock("El reparto de hoy ya terminó");
    await reparto.update({ finalizadoEn: new Date() });
    return res.json({ reparto, resumen: await resumenDelReparto(reparto) });
  } catch (error) {
    return responderErrorStock(res, error, "Error al terminar el reparto");
  }
}

// "Cancelar fin de reparto": el reparto de hoy vuelve a quedar en curso (solo el del día).
export async function reabrirReparto(req: AuthRequest, res: Response) {
  try {
    const reparto = await buscarRepartoDeHoy(req.usuario!.id);
    if (!reparto) return res.status(404).json({ error: "Todavía no comenzaste el reparto de hoy" });
    if (!reparto.finalizadoEn) throw new ConflictoStock("El reparto de hoy sigue en curso");
    await reparto.update({ finalizadoEn: null });
    return res.json(reparto);
  } catch (error) {
    return responderErrorStock(res, error, "Error al reabrir el reparto");
  }
}

// Si el usuario cambia de camioneta con el reparto en curso, el reparto pasa a ser con la nueva.
export async function sincronizarCamionetaDelReparto(usuarioId: string, camionetaId: string | null) {
  await Reparto.update(
    { camionetaId },
    { where: { usuarioId, fecha: fechaComercial(), finalizadoEn: null } },
  );
}
