import { AuthRequest } from "../middlewares/auth.middleware";
import { Response } from "express";
import Barrio from "../models/Barrio";

export async function listarBarrios(req: AuthRequest, res: Response) {
  try {
    const barrios = await Barrio.findAll({
      order: [["nombre", "ASC"]],
    });
    return res.status(200).json(barrios);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al listar barrios" });
  }
}

export async function crearBarrio(req: AuthRequest, res: Response) {
  try {
    const { nombre, diasVisita } = req.body;

    if (!nombre) {
      return res.status(400).json({
        error: "El nombre es oblgatorio",
      });
    }

    const barrio = await Barrio.create({
      nombre,
      diasVisita: diasVisita ?? [],
    });

    return res.status(201).json(barrio);
  } catch (error: any) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Ese barrio ya existe" });
    }
    console.error(error);
    return res.status(500).json({
      error: "Error al crear barrio",
    });
  }
}

export async function eliminarBarrio(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;

    const barrio = await Barrio.findByPk(id as string);

    if (!barrio) {
      return res.status(404).json({
        error: "Barrio no encontrado",
      });
    }

    await barrio.destroy();
    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al eliminar barrio" });
  }
}

export async function actualizarBarrio(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const { nombre, diasVisita } = req.body;

    const barrio = await Barrio.findByPk(id as string);
    if (!barrio) {
      return res.status(404).json({ error: "Barrio no encontrado" });
    }

    await barrio.update({
      nombre: nombre ?? barrio.nombre,
      diasVisita: diasVisita ?? barrio.diasVisita,
    });

    return res.json(barrio);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error al actualizar barrio" });
  }
}
