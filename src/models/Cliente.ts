import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type TipoCliente = 'particular' | 'confianza'

interface ClienteAttributes {
    id: string;
    nombre: string;
    apellido: string;
    direccion: string;
    telefono: string;
    localidad: string;
    saldoActual: number;
    tipoCliente: TipoCliente;
}

interface ClienteCreationAttributes
    extends Optional<ClienteAttributes, 'id' | 'saldoActual'> { }

class Cliente extends Model<ClienteAttributes, ClienteCreationAttributes>
    implements ClienteAttributes {
    public id!: string;
    public nombre!: string;
    public apellido!: string;
    public direccion!: string;
    public telefono!: string;
    public localidad!: string;
    public saldoActual!: number;
    public tipoCliente!: TipoCliente;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Cliente.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        apellido: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        direccion: {
            type: DataTypes.STRING(200),
            allowNull: true, // puede que no siempre se cargue al momento de registrar
        },
        telefono: {
            type: DataTypes.STRING(30),
            allowNull: true,
        },
        localidad: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        saldoActual: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
        },
        tipoCliente: {
            type: DataTypes.ENUM('particular', 'confianza'),
            allowNull: false,
            defaultValue: 'particular',
        },
    },
    {
        sequelize,
        tableName: 'clientes',
        timestamps: true,
    }
);

export default Cliente;