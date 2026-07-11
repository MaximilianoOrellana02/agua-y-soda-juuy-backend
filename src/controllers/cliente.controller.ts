import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import Cliente from "../models/Cliente";
import SaldoEnvase from "../models/SaldoEnvase";
import Producto from "../models/Producto";
import Barrio from "../models/Barrio";
import { geocodificarDireccion } from "../utils/geocode";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";

export async function crearCliente(req: AuthRequest, res: Response) {
  try {
    const {
      nombre,
      apellido,
      direccion,
      telefono,
      localidad,
      tipoCliente,
      barrioId,
      categoria,
    } = req.body;

    if (!nombre || !apellido) {
      return res
        .status(400)
        .json({ error: "Nombre y apellido son obligatorios" });
    }

    let coordenadas = null;
    if (direccion) {
      coordenadas = await geocodificarDireccion(direccion, localidad);
    }

    const cliente = await Cliente.create({
      nombre,
      apellido,
      direccion,
      telefono,
      localidad,
      barrioId,
      categoria,
      tipoCliente: tipoCliente || "particular",
      latitud: coordenadas?.latitud ?? null,
      longitud: coordenadas?.longitud ?? null,
    });

    return res.status(201).json(cliente);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al crear cliente" });
  }
}

// Listar todos los clientes
export async function listarClientes(req: AuthRequest, res: Response) {
  try {
    const clientes = await Cliente.findAll({
      include: [
        {
          model: SaldoEnvase,
          as: "saldosEnvase",
          attributes: ["productoId", "cantidad"],
        },
        { model: Barrio, as: "barrio", attributes: ["id", "nombre"] },
      ],
      order: [
        ["apellido", "ASC"],
        ["nombre", "ASC"],
      ],
    });
    return res.json(clientes);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar clientes" });
  }
}

// Ver un cliente puntual
export async function obtenerCliente(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id as string, {
      include: [{ model: Barrio, as: "barrio", attributes: ["id", "nombre"] }],
    });

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    return res.json(cliente);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener cliente" });
  }
}
// Actualizar un cliente
export async function actualizarCliente(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id as string);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const {
      nombre,
      apellido,
      direccion,
      telefono,
      localidad,
      tipoCliente,
      barrioId,
      categoria,
    } = req.body;

    let latitud = cliente.latitud;
    let longitud = cliente.longitud;

    const direccionCambio = direccion && direccion !== cliente.direccion;
    if (direccionCambio) {
      const coordenadas = await geocodificarDireccion(
        direccion,
        localidad ?? cliente.localidad,
      );
      latitud = coordenadas?.latitud ?? null;
      longitud = coordenadas?.longitud ?? null;
    }

    await cliente.update({
      nombre: nombre ?? cliente.nombre,
      apellido: apellido ?? cliente.apellido,
      direccion: direccion ?? cliente.direccion,
      telefono: telefono ?? cliente.telefono,
      localidad: localidad ?? cliente.localidad,
      tipoCliente: tipoCliente ?? cliente.tipoCliente,
      barrioId: barrioId ?? cliente.barrioId,
      categoria: categoria ?? cliente.categoria,
      latitud,
      longitud,
    });

    return res.json(cliente);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar cliente" });
  }
}

// Eliminar un cliente
export async function eliminarCliente(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const cliente = await Cliente.findByPk(id as string);

    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    await cliente.destroy();
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al eliminar cliente" });
  }
}

//Ver saldo de envases de un cliente (cuantos bideones tiene sin devolver, por producto)
export async function obtenerSaldoEnvases(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const cliente = await Cliente.findByPk(id as string);
    if (!cliente) {
      return res.status(404).json({
        error: "Cliente no encontrado",
      });
    }

    const saldos = await SaldoEnvase.findAll({
      where: { clienteId: id },
      include: [
        {
          model: Producto,
          as: "producto",
          attributes: ["id", "nombre"],
        },
      ],
      order: [[{ model: Producto, as: "producto" }, "nombre", "ASC"]],
    });

    const saldoConEnvases = saldos.filter((s) => s.cantidad !== 0);
    return res.json(saldoConEnvases);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al obtener saldo de envases" });
  }
}

export async function ajustarUbicacion(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { latitud, longitud } = req.body;

    if (latitud == null || longitud == null) {
      return res.status(400).json({ error: 'Latitud y longitud son obligatorias' });
    }

    const cliente = await Cliente.findByPk(id as string);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    await cliente.update({ latitud, longitud });
    return res.json(cliente);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al ajustar ubicación' });
  }
}

export async function marcarVisita(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { visitado } = req.body;
    const cliente = await Cliente.findByPk(id as string);

    if (!cliente) {
      return res.status(404).json({
        error: 'Cliente no encontrado'
      })
    }

    const hoy = new Date().toISOString().split('T')[0];

    await cliente.update({
      ultimaVisitaFecha: visitado ? hoy : null,
    });

    return res.json(cliente);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al marcar visita' });
  }
}

export async function listarDeudaVieja(req: AuthRequest, res: Response) {
  try {
    const dias = Number(req.query.dias) || 30;

    const resultados = await sequelize.query(
      `
      SELECT
        c.id,
        c.nombre,
        c.apellido,
        c.saldoActual,
        MAX(CASE WHEN h.montoPagado > 0 THEN h.fecha END) AS ultimoPago,
        MIN(h.fecha) AS primeraEntrega
      FROM clientes c
      LEFT JOIN historiales h ON h.clienteId = c.id
      WHERE c.saldoActual > 0
      GROUP BY c.id, c.nombre, c.apellido, c.saldoActual
      `,
      { type: QueryTypes.SELECT }
    );

    const hoy = new Date();

    const deudaVieja = (resultados as any[])
      .map((c) => {
        const referencia = c.ultimoPago ?? c.primeraEntrega;
        if (!referencia) return null;

        const diasSinPagar = Math.floor(
          (hoy.getTime() - new Date(referencia).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          id: c.id,
          nombre: c.nombre,
          apellido: c.apellido,
          saldoActual: Number(c.saldoActual),
          diasSinPagar,
        };
      })
      .filter((c) => c && c.diasSinPagar >= dias)
      .sort((a, b) => b!.diasSinPagar - a!.diasSinPagar);

    return res.json(deudaVieja);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al obtener deuda vieja' });
  }
}