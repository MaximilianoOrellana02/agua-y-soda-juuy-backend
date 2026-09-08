const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const db = new Sequelize('unit', 'unit', 'unit', { dialect: 'mysql', logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
const Producto = require('../dist/models/Producto').default;
const PrecioProducto = require('../dist/models/PrecioProducto').default;
const { validarProducto, validarCambioPrecio, validarFiltrosProductos, PRECIO_MAXIMO, STOCK_MINIMO_MAXIMO, DatosProductoInvalidos } = require('../dist/utils/producto.validation');
after(() => db.close());

const productoId = '11111111-1111-4111-8111-111111111111';
const alta = { nombre: 'Soda 1.5L', precioParticular: 100, precioConfianza: 90.5 };

test('creation requires a trimmed name and two positive prices with at most two decimals', () => {
    for (const body of [undefined, null, [], 'text', {}, { ...alta, nombre: '' }, { ...alta, nombre: '   ' }, { ...alta, nombre: 123 },
        { ...alta, nombre: 'x'.repeat(101) }, { ...alta, precioParticular: undefined }, { ...alta, precioConfianza: null },
        { ...alta, precioParticular: '100' }, { ...alta, precioParticular: 0 }, { ...alta, precioParticular: -5 }, { ...alta, precioParticular: 1.005 },
        { ...alta, precioConfianza: NaN }, { ...alta, precioConfianza: Infinity }, { ...alta, precioConfianza: PRECIO_MAXIMO + 1 },
        { ...alta, esRetornable: 'si' }, { ...alta, esRetornable: 1 }, { ...alta, stockMinimo: -1 }, { ...alta, stockMinimo: 1.5 },
        { ...alta, stockMinimo: '3' }, { ...alta, stockMinimo: STOCK_MINIMO_MAXIMO + 1 }]) {
        assert.throws(() => validarProducto(body, true), DatosProductoInvalidos);
    }
    assert.deepEqual(validarProducto({ ...alta, nombre: '  Soda 1.5L  ' }, true), { nombre: 'Soda 1.5L', precios: { particular: 100, confianza: 90.5 } });
    assert.deepEqual(validarProducto({ ...alta, esRetornable: false, stockMinimo: 0, activo: false, otro: 'x' }, true),
        { nombre: 'Soda 1.5L', esRetornable: false, stockMinimo: 0, precios: { particular: 100, confianza: 90.5 } });
    assert.equal(validarProducto({ ...alta, precioParticular: PRECIO_MAXIMO }, true).precios.particular, PRECIO_MAXIMO);
});

test('updates accept partial fields, reject prices and require at least one change', () => {
    for (const body of [undefined, [], {}, { otro: 1 }, { nombre: undefined }, { nombre: '' }, { nombre: 5 }, { esRetornable: 'no' }, { activo: 'true' },
        { stockMinimo: -7 }, { stockMinimo: 2.5 }, { precioParticular: 10 }, { precio: 10 }, { nombre: 'Ok', precioConfianza: 5 }]) {
        assert.throws(() => validarProducto(body, false), DatosProductoInvalidos);
    }
    assert.deepEqual(validarProducto({ nombre: ' Agua ' }, false), { nombre: 'Agua' });
    assert.deepEqual(validarProducto({ esRetornable: false, stockMinimo: 4, activo: true }, false), { esRetornable: false, stockMinimo: 4, activo: true });
});

test('price changes require a known client type and a valid price', () => {
    for (const body of [undefined, {}, { tipoCliente: 'particular' }, { precio: 10 }, { tipoCliente: 'mayorista', precio: 10 }, { tipoCliente: 'Particular', precio: 10 },
        { tipoCliente: 'confianza', precio: '10' }, { tipoCliente: 'confianza', precio: 0 }, { tipoCliente: 'confianza', precio: -1 }, { tipoCliente: 'confianza', precio: 10.123 }]) {
        assert.throws(() => validarCambioPrecio(body), DatosProductoInvalidos);
    }
    assert.deepEqual(validarCambioPrecio({ tipoCliente: 'confianza', precio: 120.25, extra: true }), { tipoCliente: 'confianza', precio: 120.25 });
});

test('listing filter only accepts incluirInactivos as "true" or "false"', () => {
    for (const query of [{ incluirInactivos: '1' }, { incluirInactivos: 'si' }, { incluirInactivos: ['true'] }, { incluirInactivos: '' }]) {
        assert.throws(() => validarFiltrosProductos(query), DatosProductoInvalidos);
    }
    assert.deepEqual(validarFiltrosProductos(undefined), { incluirInactivos: false });
    assert.deepEqual(validarFiltrosProductos({ otro: 'x' }), { incluirInactivos: false });
    assert.deepEqual(validarFiltrosProductos({ incluirInactivos: 'false' }), { incluirInactivos: false });
    assert.deepEqual(validarFiltrosProductos({ incluirInactivos: 'true' }), { incluirInactivos: true });
});

test('models trim names, validate bounds and expose prices as numbers', async () => {
    for (const data of [{ nombre: '' }, { nombre: '   ' }, { nombre: 'x'.repeat(101) }, { nombre: 7 }, { nombre: 'Soda', stockMinimo: -1 },
        { nombre: 'Soda', stockMinimo: 1.5 }, { nombre: 'Soda', stockMinimo: STOCK_MINIMO_MAXIMO + 1 }, { nombre: 'Soda', stockActual: 2.5 }]) {
        await assert.rejects(Producto.build(data).validate(), { name: 'SequelizeValidationError' });
    }
    const producto = Producto.build({ nombre: '  Soda  ' });
    await producto.validate();
    assert.equal(producto.nombre, 'Soda'); assert.equal(producto.activo, true); assert.equal(producto.esRetornable, true);
    const base = { productoId, tipoCliente: 'particular', precio: 10 };
    for (const data of [{ precio: 0 }, { precio: -1 }, { precio: 1.005 }, { precio: PRECIO_MAXIMO + 1 }, { tipoCliente: 'mayorista' }, { productoId: 'abc' }]) {
        await assert.rejects(PrecioProducto.build({ ...base, ...data }).validate(), { name: 'SequelizeValidationError' });
    }
    const precio = PrecioProducto.build({ ...base, precio: '12.50' });
    await precio.validate();
    assert.equal(precio.precio, 12.5); assert.equal(typeof precio.get({ plain: true }).precio, 'number');
    assert.ok(precio.fechaDesde instanceof Date);
});
