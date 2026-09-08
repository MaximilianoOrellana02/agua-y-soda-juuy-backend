import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';
import { STOCK_MINIMO_MAXIMO, nombreProducto } from '../utils/producto.validation';

interface ProductoAttributes {
    id: string;
    nombre: string;
    esRetornable: boolean;
    activo: boolean;
    stockActual: number;
    stockMinimo: number;
}

interface ProductoCreationAttributes
    extends Optional<ProductoAttributes, 'id' | 'esRetornable' | 'activo' | 'stockActual' | 'stockMinimo'> { }

class Producto extends Model<ProductoAttributes, ProductoCreationAttributes>
    implements ProductoAttributes {
    public id!: string;
    public nombre!: string;
    public esRetornable!: boolean;
    public activo!: boolean;
    public stockActual!: number;
    public stockMinimo!: number;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Producto.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            // El setter solo recorta; las reglas viven en validate() para que build() nunca lance.
            set(value: unknown) { this.setDataValue('nombre', (typeof value === 'string' ? value.trim() : value) as string); },
            validate: { nombreValido(value: unknown) { nombreProducto(value); } },
        },
        esRetornable: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true, // en tu negocio, casi todo es retornable
        },
        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        stockActual: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: { isInt: true },
        },
        stockMinimo: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
            validate: { isInt: true, min: 0, max: STOCK_MINIMO_MAXIMO },
        },
    },
    {
        sequelize,
        tableName: 'productos',
        timestamps: true,
    }
);

export default Producto;
