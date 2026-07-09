import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface UsuarioAttributes {
    id: string;
    username: string;
    passwordHash: string;
    nombreCompleto: string;
}

interface UsuarioCreationAttributes extends Optional<UsuarioAttributes, 'id'> { }

class Usuario extends Model<UsuarioAttributes, UsuarioCreationAttributes>
    implements UsuarioAttributes {
    public id!: string;
    public username!: string;
    public passwordHash!: string;
    public nombreCompleto!: string;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

Usuario.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        username: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        passwordHash: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        nombreCompleto: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: 'usuarios',
        timestamps: true, // agrega createdAt y updatedAt automáticamente
    }
);

export default Usuario;