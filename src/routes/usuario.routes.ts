import { Router } from "express";

import {
    registrar,
    login
} from '../controllers/usuario.controller'
import { verificarToken } from "../middlewares/auth.middleware";

const router = Router();

router.post('/registro', verificarToken, registrar)
router.post('/login', login)


export default router