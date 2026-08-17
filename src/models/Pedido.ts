import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type EstadoPedido = 'pendiente' | 'entregado';

interface PedidoAttributes {
    id: string;
    clienteId: string;
    usuarioId: string;
    detalle: string | null;
    estado: EstadoPedido;
    fecha: Date;
}

interface PedidoCreationAttributes extends Optional<PedidoAttributes, 'id' | 'estado' | 'fecha' | 'detalle'> { }


class Pedido extends Model<PedidoAttributes, PedidoCreationAttributes> implements PedidoAttributes {
    public id!: string;
    public clienteId!: string;
    public usuarioId!: string;
    public detalle!: string | null
    public estado!: EstadoPedido;
    public fecha!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Pedido.init({
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    clienteId: { type: DataTypes.UUID, allowNull: false },
    usuarioId: { type: DataTypes.UUID, allowNull: false },
    detalle: { type: DataTypes.STRING(255), allowNull: true },
    estado: {
        type: DataTypes.ENUM('pendiente', 'entregado'),
        allowNull: false,
        defaultValue: 'pendiente',
    },
    fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
},
    { sequelize, tableName: 'pedidos', timestamps: true }
)


export default Pedido