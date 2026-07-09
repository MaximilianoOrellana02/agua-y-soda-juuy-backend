import { Router } from "express";

import {
    registrar,
    login,
    cambiarPassword
} from '../controllers/usuario.controller'
import { verificarToken } from "../middlewares/auth.middleware";

const router = Router();

router.post('/registro', verificarToken, registrar)
router.post('/login', login)
router.put('/password', verificarToken, cambiarPassword);



export default router