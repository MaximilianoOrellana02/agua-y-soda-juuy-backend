import { Request, Response } from "express";
import { Op } from "sequelize";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import Usuario from "../models/Usuario";
import { AuthRequest } from "../middlewares/auth.middleware";
import { error } from "node:console";
import { enviarEmailRecuperacion } from "../services/email.service";

const JWT_SECRET = process.env.JWT_SECRET as string;
const SALT_ROUDS = 10;
const RESET_SECRET = process.env.JWT_SECRET as string;

export async function solicitarRecuperacion(req: Request, res: Response) {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'El email es obligatorio'
            })
        }

        const usuario = await Usuario.findOne({
            where: { email }
        })

        if (usuario) {
            const token = jwt.sign(
                { id: usuario.id, proposito: 'reset_password' },
                RESET_SECRET,
                { expiresIn: '30m' }
            );

            const link = `${process.env.FRONTEND_URL_RESET}/restablecer?token=${token}`;
            await enviarEmailRecuperacion(usuario.email, usuario.nombreCompleto, link);
        }
        return res.json({ mensaje: 'Si el email existe, te enviamos instrucciones' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
}

export async function restablecerPassword(req: Request, res: Response) {
    try {
        const { token, passwordNueva } = req.body;

        if (!token || !passwordNueva) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        if (passwordNueva.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }

        let payload: any;
        try {
            payload = jwt.verify(token, RESET_SECRET);
        } catch {
            return res.status(400).json({ error: 'El link expiró o no es válido' });
        }

        if (payload.proposito !== 'reset_password') {
            return res.status(400).json({ error: 'Token inválido' });
        }

        const usuario = await Usuario.findByPk(payload.id);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const nuevoHash = await bcrypt.hash(passwordNueva, SALT_ROUDS);
        await usuario.update({ passwordHash: nuevoHash });

        return res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al restablecer la contraseña' });
    }
}

export async function registrar(req: Request, res: Response) {
    try {
        const { username, password, nombreCompleto, email } = req.body;
        if (!username || !password || !nombreCompleto || !email) {
            return res.status(400).json({
                error: 'Faltan datos obligatorios'
            });
        }

        const existente = await Usuario.findOne({
            where: {
                [Op.or]: [{ username }, { email }]
            }
        });

        if (existente) {
            if (existente.username === username) {
                return res.status(409).json({
                    error: 'El username ya está en uso'
                });
            }
            if (existente.email === email) {
                return res.status(409).json({
                    error: 'El email ya está registrado'
                });
            }
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUDS);

        const nuevoUsuario = await Usuario.create({
            username,
            passwordHash,
            nombreCompleto,
            email,
        })

        return res.status(201).json({
            id: nuevoUsuario.id,
            username: nuevoUsuario.username,
            nombreCompleto: nuevoUsuario.nombreCompleto,
            email: nuevoUsuario.email,
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al registrar usuario' });
    }
}

export async function login(req: Request, res: Response) {
    try {
        const { username, password } = req.body

        if (!username || !password) {
            return res.status(400).json({
                error: 'Faltan datos obligatorios'
            })
        }

        const usuario = await Usuario.findOne({
            where: { username }
        })

        if (!usuario) {
            return res.status(404).json({
                error: 'Usuario o contraseña incorrectos'
            })
        }

        const passwordValida = await bcrypt.compare(password, usuario.passwordHash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        const token = jwt.sign(
            { id: usuario.id, username: usuario.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                nombreCompleto: usuario.nombreCompleto,
                email: usuario.email,
            },
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al iniciar sesión' });
    }
}

export async function cambiarPassword(req: AuthRequest, res: Response) {
    try {
        const { passwordActual, passwordNueva } = req.body;

        if (!passwordActual || !passwordNueva) {
            return res.status(400).json({ error: 'Faltan datos obligatorios' });
        }

        if (passwordNueva.length < 6) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
        }

        const usuario = await Usuario.findByPk(req.usuario!.id);
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const passwordValida = await bcrypt.compare(passwordActual, usuario.passwordHash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
        }

        const nuevoHash = await bcrypt.hash(passwordNueva, SALT_ROUDS);
        await usuario.update({ passwordHash: nuevoHash });

        return res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
}