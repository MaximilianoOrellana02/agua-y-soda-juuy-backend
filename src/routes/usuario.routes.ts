import { Router } from "express";

import {
    registrar,
    login,
    cambiarPassword,
    solicitarRecuperacion,
    restablecerPassword
} from '../controllers/usuario.controller'
import { verificarToken } from "../middlewares/auth.middleware";

const router = Router();

router.post('/registro', verificarToken, registrar)
router.post('/login', login)
router.put('/password', verificarToken, cambiarPassword);
router.post('/recuperar', solicitarRecuperacion);
router.post('/restablecer', restablecerPassword)



export default router