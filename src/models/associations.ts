import Producto from "./Producto";
import PrecioProducto from "./PrecioProducto";
import Cliente from "./Cliente";
import Usuario from "./Usuario";
import SaldoEnvase from "./SaldoEnvase";
import Historial from "./Historial";
import HistorialDetalle from "./HistorialDetalle";
import Barrio from "./Barrio";
import MovimientoStock from "./MovimientoStock";
import Pedido from "./Pedido";
import StockCamioneta from "./StockCamioneta";
import Camioneta from "./Camioneta";
import Reparto from "./Reparto";

// Producto <-> PrecioProducto
Producto.hasMany(PrecioProducto, { foreignKey: "productoId", as: "precios" });
PrecioProducto.belongsTo(Producto, {
  foreignKey: "productoId",
  as: "producto",
});

// Cliente <-> SaldoEnvase <-> Producto
Cliente.hasMany(SaldoEnvase, { foreignKey: "clienteId", as: "saldosEnvase" });
SaldoEnvase.belongsTo(Cliente, { foreignKey: "clienteId", as: "cliente" });
Producto.hasMany(SaldoEnvase, { foreignKey: "productoId", as: "saldosEnvase" });
SaldoEnvase.belongsTo(Producto, { foreignKey: "productoId", as: "producto" });

// Cliente <-> Historial <-> Usuario
Cliente.hasMany(Historial, { foreignKey: "clienteId", as: "historiales" });
Historial.belongsTo(Cliente, { foreignKey: "clienteId", as: "cliente" });
Usuario.hasMany(Historial, { foreignKey: "usuarioId", as: "historiales" });
Historial.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Historial <-> HistorialDetalle <-> Producto
Historial.hasMany(HistorialDetalle, {
  foreignKey: "historialId",
  as: "detalles",
});
HistorialDetalle.belongsTo(Historial, {
  foreignKey: "historialId",
  as: "historial",
});
Producto.hasMany(HistorialDetalle, {
  foreignKey: "productoId",
  as: "detallesHistorial",
});
HistorialDetalle.belongsTo(Producto, {
  foreignKey: "productoId",
  as: "producto",
});

Producto.hasMany(MovimientoStock, {
  foreignKey: "productoId",
  as: "movimientosStock",
});
MovimientoStock.belongsTo(Producto, {
  foreignKey: "productoId",
  as: "producto",
});
Usuario.hasMany(MovimientoStock, {
  foreignKey: "usuarioId",
  as: "movimientosStock",
});
MovimientoStock.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

// Cliente <-> Barrio
Barrio.hasMany(Cliente, {
  foreignKey: "barrioId",
  as: "clientes",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});
Cliente.belongsTo(Barrio, {
  foreignKey: "barrioId",
  as: "barrio",
  onDelete: "RESTRICT",
  onUpdate: "CASCADE",
});

//Pedidos
Cliente.hasMany(Pedido, { foreignKey: "clienteId", as: "pedidos" });
Pedido.belongsTo(Cliente, { foreignKey: "clienteId", as: "cliente" });

Camioneta.hasMany(StockCamioneta, { foreignKey: "camionetaId", as: "stock" });
StockCamioneta.belongsTo(Camioneta, {
  foreignKey: "camionetaId",
  as: "camioneta",
});
Producto.hasMany(StockCamioneta, {
  foreignKey: "productoId",
  as: "stockEnCamionetas",
});
StockCamioneta.belongsTo(Producto, {
  foreignKey: "productoId",
  as: "producto",
});

Camioneta.hasMany(MovimientoStock, {
  foreignKey: "camionetaId",
  as: "movimientosStock",
});
MovimientoStock.belongsTo(Camioneta, {
  foreignKey: "camionetaId",
  as: "camioneta",
});

Camioneta.hasMany(Historial, { foreignKey: "camionetaId", as: "historiales" });
Historial.belongsTo(Camioneta, { foreignKey: "camionetaId", as: "camioneta" });

Camioneta.hasMany(Usuario, {
  foreignKey: "camionetaActivaId",
  as: "repartidores",
});
Usuario.belongsTo(Camioneta, {
  foreignKey: "camionetaActivaId",
  as: "camionetaActiva",
});

// Reparto del día <-> Usuario / Camioneta
Usuario.hasMany(Reparto, { foreignKey: "usuarioId", as: "repartos" });
Reparto.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });
Camioneta.hasMany(Reparto, { foreignKey: "camionetaId", as: "repartos" });
Reparto.belongsTo(Camioneta, { foreignKey: "camionetaId", as: "camioneta" });
