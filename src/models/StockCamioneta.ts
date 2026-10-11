import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { uuidDeModelo } from "../utils/cliente.validation";
import { CANTIDAD_MAXIMA } from "../utils/stock.validation";

interface StockCamionetaAttributes {
  id: string;
  camionetaId: string;
  productoId: string;
  cantidad: number;
}

interface StockCamionetaCreationAttributes extends Optional<
  StockCamionetaAttributes,
  "id" | "cantidad"
> {}

class StockCamioneta
  extends Model<StockCamionetaAttributes, StockCamionetaCreationAttributes>
  implements StockCamionetaAttributes
{
  public id!: string;
  public camionetaId!: string;
  public productoId!: string;
  public cantidad!: number;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

StockCamioneta.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    camionetaId: {
      type: DataTypes.UUID,
      allowNull: false,
      validate: { uuidValido: uuidDeModelo },
    },
    productoId: {
      type: DataTypes.UUID,
      allowNull: false,
      validate: { uuidValido: uuidDeModelo },
    },
    // Una camioneta no puede llevar stock negativo (a diferencia del depósito).
    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { isInt: true, min: 0, max: CANTIDAD_MAXIMA },
    },
  },
  {
    sequelize,
    tableName: "stock_camionetas",
    timestamps: true,
    indexes: [
      {
        name: "uq_stock_camioneta_producto",
        unique: true,
        fields: ["camionetaId", "productoId"],
      },
    ],
  },
);

export default StockCamioneta;
