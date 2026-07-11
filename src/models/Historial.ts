import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';


export type MetodoPago = 'efectivo' | 'transferencia';

interface HistorialAttributes {
    id: string;
    clienteId: string;
    usuarioId: string;
    fecha: Date;
    saldoAnterior: number;
    importeTotal: number;
    montoPagado: number;
    saldoFinal: number;
    observacion: string | null;
    metodoPago: MetodoPago;

}

interface HistorialCreationAttributes
    extends Optional<HistorialAttributes, 'id' | 'fecha' | 'observacion' | 'metodoPago'> { }

class Historial extends Model<HistorialAttributes, HistorialCreationAttributes>
    implements HistorialAttributes {
    public id!: string;
    public clienteId!: string;
    public usuarioId!: string;
    public fecha!: Date;
    public saldoAnterior!: number;
    public importeTotal!: number;
    public montoPagado!: number;
    public saldoFinal!: number;
    public observacion!: string | null;
    public metodoPago!: MetodoPago;


    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Historial.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        clienteId: { type: DataTypes.UUID, allowNull: false },
        usuarioId: { type: DataTypes.UUID, allowNull: false },
        fecha: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        saldoAnterior: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        importeTotal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        montoPagado: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        saldoFinal: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        observacion: { type: DataTypes.STRING(255), allowNull: true },
        metodoPago: {
            type: DataTypes.ENUM('efectivo', 'transferencia'),
            allowNull: false,
            defaultValue: 'efectivo',
        },
    },
    {
        sequelize,
        tableName: 'historiales',
        timestamps: true,
    }
);

export default Historial;