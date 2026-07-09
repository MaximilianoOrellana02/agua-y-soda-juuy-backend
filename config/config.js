require('dotenv').config();

const usarSSL = process.env.DB_SSL === 'true';

module.exports = {
    development: {
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        dialectOptions: usarSSL
            ? { ssl: { require: true, rejectUnauthorized: false } }
            : {},
    },
};