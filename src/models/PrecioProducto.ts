import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { uuidDeModelo } from '../utils/cliente.validation';
import { TipoCliente } from './Cliente';
import { PRECIO_MAXIMO, TIPOS_CLIENTE, esPrecioValido } from '../utils/producto.validation';

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
            validate: { uuidValido: uuidDeModelo },
        },
        tipoCliente: {
            type: DataTypes.ENUM(...TIPOS_CLIENTE),
            allowNull: false,
            validate: { isIn: [[...TIPOS_CLIENTE]] },
        },
        precio: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            // MySQL devuelve DECIMAL como texto; la API siempre expone el precio como numero.
            get() { const value = this.getDataValue('precio'); return value == null ? value : Number(value); },
            validate: {
                precioValido(value: unknown) {
                    if (!esPrecioValido(typeof value === 'string' ? Number(value) : value)) {
                        throw new Error(`El precio debe ser mayor a 0, de hasta 2 decimales y no mayor a ${PRECIO_MAXIMO}`);
                    }
                },
            },
        },
        fechaDesde: {
            type: DataTypes.DATE(3),
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
