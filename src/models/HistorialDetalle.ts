import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface HistorialDetalleAttributes {
    id: string;
    historialId: string;
    productoId: string;
    cantidadEntregada: number;
    cantidadEnvaseDevuelto: number;
    precioUnitario: number;
    importe: number;
}

interface HistorialDetalleCreationAttributes
    extends Optional<HistorialDetalleAttributes, 'id' | 'cantidadEnvaseDevuelto'> { }

class HistorialDetalle extends Model<HistorialDetalleAttributes, HistorialDetalleCreationAttributes>
    implements HistorialDetalleAttributes {
    public id!: string;
    public historialId!: string;
    public productoId!: string;
    public cantidadEntregada!: number;
    public cantidadEnvaseDevuelto!: number;
    public precioUnitario!: number;
    public importe!: number;
}

HistorialDetalle.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        historialId: { type: DataTypes.UUID, allowNull: false },
        productoId: { type: DataTypes.UUID, allowNull: false },
        cantidadEntregada: { type: DataTypes.INTEGER, allowNull: false },
        cantidadEnvaseDevuelto: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        precioUnitario: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        importe: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    },
    {
        sequelize,
        tableName: 'historial_detalles',
        timestamps: false, // no necesitamos createdAt/updatedAt en el detalle, ya lo tiene la cabecera
    }
);

export default HistorialDetalle;