import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface BarrioAttributes {
  id: string;
  nombre: string;
  diasVisita: string[];
}

interface BarrioCreationAttributes extends Optional<
  BarrioAttributes,
  "id" | "diasVisita"
> {}

class Barrio
  extends Model<BarrioAttributes, BarrioCreationAttributes>
  implements BarrioAttributes
{
  public id!: string;
  public nombre!: string;
  public diasVisita!: string[];

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Barrio.init(
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
    },
    diasVisita: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },
  },
  {
    sequelize,
    tableName: "barrios",
    timestamps: true,
  },
);

export default Barrio;
