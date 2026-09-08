import { Router } from "express";

import {
    registrar,
    login,
    cambiarPassword,
    solicitarRecuperacion,
    restablecerPassword
} from '../controllers/usuario.controller'
import { verificarToken } from "../middlewares/auth.middleware";
import { limitarIntentos } from '../middlewares/usuario-rate-limit.middleware';

export function crearUsuarioRouter() {
    const router = Router();
    router.post('/registro', limitarIntentos(20), verificarToken, registrar);
    router.post('/login', limitarIntentos(15), login);
    router.put('/password', limitarIntentos(10), verificarToken, cambiarPassword);
    router.post('/recuperar', limitarIntentos(5), solicitarRecuperacion);
    router.post('/restablecer', limitarIntentos(10), restablecerPassword);
    return router;
}

export default crearUsuarioRouter();
