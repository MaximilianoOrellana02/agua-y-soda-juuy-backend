import express from 'express';
import cors from 'cors';
import usuarioRoutes from './routes/usuario.routes'
import clienteRoutes from './routes/cliente.routes'
import productoRoutes from './routes/producto.routes';
import historialRoutes from './routes/historial.routes';



const app = express();

const origenesPermitidos = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : true;;

app.use(cors({ origin: origenesPermitidos }));

app.use(express.json());

// Acá vamos a ir agregando las rutas a medida que las creemos, ej:
app.use('/api/usuarios', usuarioRoutes)
app.use('/api/clientes', clienteRoutes)
app.use('/api/productos', productoRoutes);
app.use('/api/historial', historialRoutes)

export default app;