const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const db = new Sequelize('unit', 'unit', 'unit', { dialect: 'mysql', logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
const StockCamioneta = require('../dist/models/StockCamioneta').default;
const MovimientoStock = require('../dist/models/MovimientoStock').default;
const Usuario = require('../dist/models/Usuario').default;
const { validarCamioneta, validarMovimientoCamioneta } = require('../dist/utils/camioneta.validation');
const { validarFiltrosMovimientos, DatosStockInvalidos, CANTIDAD_MAXIMA } = require('../dist/utils/stock.validation');
const { validarEntrega, DatosHistorialInvalidos } = require('../dist/utils/historial.validation');
const { rolValido } = require('../dist/utils/usuario.validation');
const { camionetaDelDia } = require('../dist/services/stock-camioneta.service');
const { soloAdmin } = require('../dist/middlewares/auth.middleware');
const { fechaComercial } = require('../dist/utils/fecha-comercial');
after(() => db.close());

const id = '11111111-1111-4111-8111-111111111111';
const carga = { productoId: id, tipo: 'carga', cantidad: 5 };

test('trucks need a bounded name on create and at least one field on update', () => {
    for (const body of [undefined, [], {}, { nombre: '' }, { nombre: '   ' }, { nombre: 'x'.repeat(61) }, { nombre: 5 },
        { nombre: 'A', patente: 123 }, { nombre: 'A', patente: 'x'.repeat(16) }, { nombre: 'A', activa: 'si' }]) {
        assert.throws(() => validarCamioneta(body, true), DatosStockInvalidos, JSON.stringify(body));
    }
    assert.deepEqual(validarCamioneta({ nombre: ' Camioneta 1 ', patente: ' ab 123 cd ' }, true), { nombre: 'Camioneta 1', patente: 'AB 123 CD' });
    assert.deepEqual(validarCamioneta({ patente: '' }, false), { patente: null });
    assert.deepEqual(validarCamioneta({ activa: false }, false), { activa: false });
    assert.throws(() => validarCamioneta({}, false), DatosStockInvalidos);
});

test('truck movements default to affecting general stock and require a reason only for write-offs', () => {
    for (const body of [undefined, {}, { ...carga, productoId: 'abc' }, { ...carga, tipo: 'entrada' }, { ...carga, cantidad: 0 },
        { ...carga, cantidad: 1.5 }, { ...carga, cantidad: CANTIDAD_MAXIMA + 1 }, { ...carga, afectaStockGeneral: 'no' },
        { ...carga, tipo: 'descarga', afectaStockGeneral: false }, { ...carga, motivo: 'x'.repeat(256) }]) {
        assert.throws(() => validarMovimientoCamioneta(body), DatosStockInvalidos, JSON.stringify(body));
    }
    assert.deepEqual(validarMovimientoCamioneta(carga), { ...carga, motivo: null, afectaStockGeneral: true });
    assert.equal(validarMovimientoCamioneta({ ...carga, afectaStockGeneral: false }).afectaStockGeneral, false);
    assert.equal(validarMovimientoCamioneta({ ...carga, tipo: 'descarga' }).motivo, null);
    assert.equal(validarMovimientoCamioneta({ ...carga, tipo: 'descarga', afectaStockGeneral: false, motivo: ' Rotura ' }).motivo, 'Rotura');
});

test('truck stock rows reject negative or fractional quantities; depot movements accept a null truck', async () => {
    for (const cantidad of [-1, 1.5, CANTIDAD_MAXIMA + 1]) {
        await assert.rejects(StockCamioneta.build({ camionetaId: id, productoId: id, cantidad }).validate(), { name: 'SequelizeValidationError' });
    }
    await assert.rejects(StockCamioneta.build({ camionetaId: 'abc', productoId: id }).validate(), { name: 'SequelizeValidationError' });
    await StockCamioneta.build({ camionetaId: id, productoId: id, cantidad: 0 }).validate();
    const movimiento = { productoId: id, usuarioId: id, tipo: 'entrada', cantidad: 1 };
    await MovimientoStock.build(movimiento).validate();
    await MovimientoStock.build({ ...movimiento, camionetaId: id }).validate();
    await assert.rejects(MovimientoStock.build({ ...movimiento, camionetaId: 'abc' }).validate(), { name: 'SequelizeValidationError' });
});

test('stock listing filters by truck or depot', () => {
    assert.equal(validarFiltrosMovimientos({ camionetaId: id }).camionetaId, id);
    assert.equal(validarFiltrosMovimientos({ camionetaId: 'deposito' }).camionetaId, null);
    assert.equal('camionetaId' in validarFiltrosMovimientos({}), false);
    for (const camionetaId of ['abc', '', ['deposito']]) assert.throws(() => validarFiltrosMovimientos({ camionetaId }), DatosStockInvalidos);
});

test('deliveries accept an explicit truck, null for the depot, or nothing to use the chosen truck', () => {
    const base = { clienteId: id, montoPagado: 10 };
    assert.equal('camionetaId' in validarEntrega(base), false);
    assert.equal(validarEntrega({ ...base, camionetaId: null }).camionetaId, null);
    assert.equal(validarEntrega({ ...base, camionetaId: id }).camionetaId, id);
    assert.throws(() => validarEntrega({ ...base, camionetaId: 'abc' }), DatosHistorialInvalidos);
});

test('the chosen truck only counts on the day it was chosen', () => {
    const usuario = (fecha) => Usuario.build({ username: 'u', nombreCompleto: 'U', email: 'u@example.com', passwordHash: 'x', camionetaActivaId: id, camionetaActivaFecha: fecha });
    assert.equal(camionetaDelDia(usuario(fechaComercial())), id);
    assert.equal(camionetaDelDia(usuario('2000-01-01')), null);
    assert.equal(camionetaDelDia(Usuario.build({ username: 'u', nombreCompleto: 'U', email: 'u@example.com', passwordHash: 'x' })), null);
});

test('roles default to repartidor and only admins pass soloAdmin', () => {
    assert.equal(rolValido(undefined), 'repartidor');
    assert.equal(rolValido('admin'), 'admin');
    for (const value of ['Admin', 'jefe', null, 1]) assert.equal(rolValido(value), null);
    assert.equal(Usuario.build({ username: 'u', nombreCompleto: 'U', email: 'u@example.com', passwordHash: 'x' }).rol, 'repartidor');
    const respuesta = () => ({ statusCode: 0, status(code) { this.statusCode = code; return this; }, json() { return this; } });
    let next = 0;
    for (const rol of ['repartidor', undefined]) {
        const res = respuesta(); soloAdmin({ usuario: { id, rol } }, res, () => next++);
        assert.equal(res.statusCode, 403);
    }
    soloAdmin({ usuario: { id, rol: 'admin' } }, respuesta(), () => next++);
    assert.equal(next, 1);
});

test('bulk loads need 1 to 50 unique products with positive quantities', () => {
    const { validarCargaCamioneta, ITEMS_CARGA_MAXIMO } = require('../dist/utils/camioneta.validation');
    const otro = '22222222-2222-4222-8222-222222222222';
    for (const body of [undefined, {}, { items: [] }, { items: 'x' }, { items: [null] }, { items: [{ productoId: 'abc', cantidad: 1 }] },
        { items: [{ productoId: id, cantidad: 0 }] }, { items: [{ productoId: id, cantidad: 1 }, { productoId: id, cantidad: 1 }] },
        { items: Array.from({ length: ITEMS_CARGA_MAXIMO + 1 }, () => ({ productoId: id, cantidad: 1 })) },
        { items: [{ productoId: id, cantidad: 1 }], afectaStockGeneral: 1 }]) {
        assert.throws(() => validarCargaCamioneta(body), DatosStockInvalidos, JSON.stringify(body)?.slice(0, 80));
    }
    assert.deepEqual(validarCargaCamioneta({ items: [{ productoId: id, cantidad: 2 }, { productoId: otro, cantidad: 3 }] }),
        { items: [{ productoId: id, cantidad: 2 }, { productoId: otro, cantidad: 3 }], motivo: null, afectaStockGeneral: true });
    assert.equal(validarCargaCamioneta({ items: [{ productoId: id, cantidad: 2 }], afectaStockGeneral: false }).afectaStockGeneral, false);
});
