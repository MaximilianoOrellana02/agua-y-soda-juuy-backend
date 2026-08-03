import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
    usuario?: {
        id: string;
        username: string;
    };
}

export async function verificarToken(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
        
        const usuarioExiste = await Usuario.findByPk(payload.id);
        if (!usuarioExiste) {
            return res.status(401).json({ error: 'Usuario no encontrado o sesión inválida' });
        }

        req.usuario = payload;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}
