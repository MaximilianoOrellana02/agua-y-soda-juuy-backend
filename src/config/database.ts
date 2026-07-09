import { Sequelize } from "sequelize";
import dotenv from "dotenv"

dotenv.config();

const usarSSL = process.env.DB_SSL === 'true';

const sequelize = new Sequelize(
    process.env.DB_NAME as string,
    process.env.DB_USER as string,
    process.env.DB_PASSWORD as string,
    {
        host: process.env.DB_HOST,
        port: Number(process.env.BD_PORT),
        dialect: 'mysql',
        logging: false,
        dialectOptions: usarSSL
            ? {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            }
            : {},
    }
);

export default sequelize