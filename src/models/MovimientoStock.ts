import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type TipoMovimientoStock = 'entrada' | 'salida';

interface MovimientoStockAttributes {
    id: string;
    productoId: string;
    usuarioId: string;
    tipo: TipoMovimientoStock;
    cantidad: number;
    motivo: string | null;
    fecha: Date;
}

interface MovimientoStockCreationAttributes
    extends Optional<MovimientoStockAttributes, 'id' | 'fecha' | 'motivo'> { }

class MovimientoStock extends Model<MovimientoStockAttributes, MovimientoStockCreationAttributes>
    implements MovimientoStockAttributes {
    public id!: string;
    public productoId!: string;
    public usuarioId!: string;
    public tipo!: TipoMovimientoStock;
    public cantidad!: number;
    public motivo!: string | null;
    public fecha!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

MovimientoStock.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        productoId: { type: DataTypes.UUID, allowNull: false },
        usuarioId: { type: DataTypes.UUID, allowNull: false },
        tipo: {
            type: DataTypes.ENUM('entrada', 'salida'),
            allowNull: false,
        },
        cantidad: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        motivo: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        fecha: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        tableName: 'movimientos_stock',
        timestamps: true,
    }
);

export default MovimientoStock;
