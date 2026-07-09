import { Request, Response } from "express";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import Usuario from "../models/Usuario";
import { error } from "node:console";

const JWT_SECRET = process.env.JWT_SECRET as string;
const SALT_ROUDS = 10;

export async function registrar(req: Request, res: Response) {
    try {
        const { username, password, nombreCompleto } = req.body;
        if (!username || !password || !nombreCompleto) {
            return res.status(400).json({
                error: 'Faltan datos obligatorios'
            });
        }

        const existente = await Usuario.findOne({
            where: {
                username
            }
        });

        if (existente) {
            return res.status(409).json({
                error: 'El username ya esta en uso'
            })
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUDS);

        const nuevoUsuario = await Usuario.create({
            username,
            passwordHash,
            nombreCompleto
        })

        return res.status(201).json({
            id: nuevoUsuario.id,
            username: nuevoUsuario.username,
            nombreCompleto: nuevoUsuario.nombreCompleto,
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
            { expiresIn: '8h' }
        );

        return res.json({
            token,
            usuario: {
                id: usuario.id,
                username: usuario.username,
                nombreCompleto: usuario.nombreCompleto,
            },
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error al iniciar sesión' });
    }
}