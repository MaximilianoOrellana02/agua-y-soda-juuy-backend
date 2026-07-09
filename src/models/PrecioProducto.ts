import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { TipoCliente } from './Cliente';

interface PrecioProductoAttributes {
    id: string;
    productoId: string;
    tipoCliente: TipoCliente;
    precio: number;
    fechaDesde: Date;
}

interface PrecioProductoCreationAttributes
    extends Optional<PrecioProductoAttributes, 'id' | 'fechaDesde'> { }

class PrecioProducto extends Model<PrecioProductoAttributes, PrecioProductoCreationAttributes>
    implements PrecioProductoAttributes {
    public id!: string;
    public productoId!: string;
    public tipoCliente!: TipoCliente;
    public precio!: number;
    public fechaDesde!: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

PrecioProducto.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        productoId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        tipoCliente: {
            type: DataTypes.ENUM('particular', 'confianza'),
            allowNull: false,
        },
        precio: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        fechaDesde: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        tableName: 'precios_producto',
        timestamps: true,
    }
);

export default PrecioProducto;