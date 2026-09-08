import { Request, Response, NextFunction } from 'express';
import Usuario from '../models/Usuario';
import { Sesion, verificarSesion } from '../services/token.service';
import { responderErrorUsuario } from '../utils/usuario.error';

export interface AuthRequest extends Request {
    usuario?: Sesion;
}

export async function verificarToken(req: AuthRequest, res: Response, next: NextFunction) {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: 'Token no proporcionado o invalido' });
    try {
        const payload = verificarSesion(match[1]);
        if (!payload) return res.status(401).json({ error: 'Token invalido o expirado' });
        const usuario = await Usuario.findByPk(payload.id);
        if (!usuario || usuario.sessionVersion !== payload.sessionVersion) {
            return res.status(401).json({ error: 'Usuario no encontrado o sesion invalida' });
        }
        req.usuario = { id: usuario.id, username: usuario.username, sessionVersion: usuario.sessionVersion };
    } catch (error) {
        return responderErrorUsuario(res, error, 'Error al verificar la sesion');
    }
    next();
}
