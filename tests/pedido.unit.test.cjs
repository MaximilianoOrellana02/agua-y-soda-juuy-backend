const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');
const db = new Sequelize('unit', 'unit', 'unit', { dialect: 'mysql', logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
const Pedido = require('../dist/models/Pedido').default;
const { validarPedido, validarFiltrosPedidos, DETALLE_MAXIMO, DatosPedidoInvalidos } = require('../dist/utils/pedido.validation');
after(() => db.close());

const clienteId = '11111111-1111-4111-8111-111111111111';

test('order bodies require a uuid client and an optional bounded text detail', () => {
    for (const body of [undefined, null, [], 'text', {}, { clienteId: 'abc' }, { clienteId: 5 }, { clienteId, detalle: 123 }, { clienteId, detalle: {} },
        { clienteId, detalle: ['x'] }, { clienteId, detalle: true }, { clienteId, detalle: 'x'.repeat(DETALLE_MAXIMO + 1) }]) {
        assert.throws(() => validarPedido(body), DatosPedidoInvalidos);
    }
    assert.deepEqual(validarPedido({ clienteId }), { clienteId, detalle: null });
    for (const detalle of [undefined, null, '', '   ']) assert.deepEqual(validarPedido({ clienteId, detalle }), { clienteId, detalle: null });
    assert.deepEqual(validarPedido({ clienteId, detalle: '  2 bidones  ', estado: 'entregado', usuarioId: 'x' }), { clienteId, detalle: '2 bidones' });
    assert.equal(validarPedido({ clienteId, detalle: 'x'.repeat(DETALLE_MAXIMO) }).detalle.length, DETALLE_MAXIMO);
});

test('listing filters default to pending orders and validate estado and clienteId', () => {
    for (const query of [{ estado: 'otro' }, { estado: 'Pendiente' }, { estado: ['pendiente'] }, { estado: '' }, { clienteId: 'abc' }, { clienteId: 5 }]) {
        assert.throws(() => validarFiltrosPedidos(query), DatosPedidoInvalidos);
    }
    assert.deepEqual(validarFiltrosPedidos(undefined), { estado: 'pendiente' });
    assert.deepEqual(validarFiltrosPedidos({ otro: 'x' }), { estado: 'pendiente' });
    assert.deepEqual(validarFiltrosPedidos({ estado: 'entregado' }), { estado: 'entregado' });
    assert.deepEqual(validarFiltrosPedidos({ estado: 'todos' }), {});
    assert.deepEqual(validarFiltrosPedidos({ estado: 'todos', clienteId }), { clienteId });
    assert.deepEqual(validarFiltrosPedidos({ clienteId }), { estado: 'pendiente', clienteId });
});

test('model trims details, nulls blank ones and enforces ids, states and bounds', async () => {
    const base = { clienteId, usuarioId: clienteId };
    for (const data of [{ clienteId: 'abc' }, { usuarioId: 'abc' }, { estado: 'cancelado' }, { detalle: 'x'.repeat(DETALLE_MAXIMO + 1) }]) {
        await assert.rejects(Pedido.build({ ...base, ...data }).validate(), { name: 'SequelizeValidationError' });
    }
    const pedido = Pedido.build({ ...base, detalle: '  Soda  ' });
    await pedido.validate();
    assert.equal(pedido.detalle, 'Soda'); assert.equal(pedido.estado, 'pendiente'); assert.ok(pedido.fecha instanceof Date);
    for (const detalle of ['', '   ', null, undefined]) {
        const vacio = Pedido.build({ ...base, detalle });
        await vacio.validate();
        // build() no asigna claves undefined; en la base la columna queda NULL igual.
        assert.equal(vacio.detalle ?? null, null);
    }
});
