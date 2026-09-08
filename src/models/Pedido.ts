import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { uuidDeModelo } from '../utils/cliente.validation';
import { DETALLE_MAXIMO, ESTADOS_PEDIDO, EstadoPedido as Estado } from '../utils/pedido.validation';

export type EstadoPedido = Estado;

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
    clienteId: { type: DataTypes.UUID, allowNull: false, validate: { uuidValido: uuidDeModelo } },
    usuarioId: { type: DataTypes.UUID, allowNull: false, validate: { uuidValido: uuidDeModelo } },
    detalle: {
        type: DataTypes.STRING(DETALLE_MAXIMO),
        allowNull: true,
        // El setter solo normaliza (recorta y deja null si queda vacio); los limites viven en validate().
        set(value: unknown) {
            const texto = typeof value === 'string' ? value.trim() : value;
            this.setDataValue('detalle', (texto === '' ? null : texto) as string | null);
        },
        validate: { len: [1, DETALLE_MAXIMO] },
    },
    estado: {
        type: DataTypes.ENUM(...ESTADOS_PEDIDO),
        allowNull: false,
        defaultValue: 'pendiente',
        validate: { isIn: [[...ESTADOS_PEDIDO]] },
    },
    fecha: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
},
    { sequelize, tableName: 'pedidos', timestamps: true }
)


export default Pedido
