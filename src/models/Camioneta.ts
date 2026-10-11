import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface CamionetaAttributes {
  id: string;
  nombre: string;
  patente: string | null;
  activa: boolean;
}

interface CamionetaCreationAttributes
  extends Optional<CamionetaAttributes, 'id' | 'patente' | 'activa'> {}

class Camioneta
  extends Model<CamionetaAttributes, CamionetaCreationAttributes>
  implements CamionetaAttributes
{
  public id!: string;
  public nombre!: string;
  public patente!: string | null;
  public activa!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Camioneta.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    patente: { type: DataTypes.STRING(15), allowNull: true },
    activa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, tableName: 'camionetas', timestamps: true }
);

export default Camioneta;