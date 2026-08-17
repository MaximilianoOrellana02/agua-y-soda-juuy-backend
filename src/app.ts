import express from 'express';
import cors from 'cors';
import usuarioRoutes from './routes/usuario.routes'
import clienteRoutes from './routes/cliente.routes'
import productoRoutes from './routes/producto.routes';
import historialRoutes from './routes/historial.routes';
import barrioRoutes from './routes/barrio.routes';
import stockRoutes from './routes/stock.routes'
import mercadopagoRoutes from './routes/mercadopago.routes';
import pedidoRoutes from './routes/pedido.routes'


const app = express();

const origenesPermitidos = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : true;;

app.use(cors({ origin: origenesPermitidos }));

app.use(express.json());

// Acá rutas
app.use('/api/usuarios', usuarioRoutes)
app.use('/api/clientes', clienteRoutes)
app.use('/api/productos', productoRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/barrios', barrioRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/mercadopago', mercadopagoRoutes);
app.use('/api/pedidos', pedidoRoutes)


export default app;