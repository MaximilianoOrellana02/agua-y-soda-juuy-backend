const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { Sequelize, ConnectionError, ForeignKeyConstraintError } = require('sequelize');
const config = require('../config/config').development;
const databaseName = 'soderia_cliente_test_' + randomBytes(8).toString('hex');
const adminDb = new Sequelize({ ...config, logging: false });
const db = new Sequelize({ ...config, database: databaseName, logging: false });
function mockModule(name, exports) { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; }
mockModule('../dist/config/database', { __esModule: true, default: db });
let geoResult = null, geoCalls = [];
mockModule('../dist/utils/geocode', { geocodificarDireccion: async (...args) => { geoCalls.push(args); return geoResult; } });
process.env.JWT_SECRET = 'cliente-integration-tests-only';
require('../dist/models/associations');
const Cliente = require('../dist/models/Cliente').default;
const Usuario = require('../dist/models/Usuario').default;
const Barrio = require('../dist/models/Barrio').default;
const Pedido = require('../dist/models/Pedido').default;
const Historial = require('../dist/models/Historial').default;
const SaldoEnvase = require('../dist/models/SaldoEnvase').default;
const Producto = require('../dist/models/Producto').default;
const { crearSesion } = require('../dist/services/token.service');
const { fechaComercial } = require('../dist/utils/fecha-comercial');
const migration = require('../migrations/20260908010000-clientes-baja-logica');
let created = false, server, base, user, token, cliente;

function assertScratch() {
    assert.match(databaseName, /^soderia_cliente_test_[a-f0-9]{16}$/);
    assert.notEqual(databaseName, config.database);
    assert.equal(db.getDatabaseName(), databaseName);
}
async function request(url, method = 'GET', body, auth = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
const clientUrl = (suffix = '') => '/clientes/' + cliente.id + suffix;

before(async () => {
    assertScratch();
    await adminDb.getQueryInterface().createDatabase(databaseName); created = true;
    const migrations = path.join(__dirname, '../migrations');
    for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.js')).sort()) await require(path.join(migrations, file)).up(db.getQueryInterface(), Sequelize);
    user = await Usuario.create({ username: 'fixture', nombreCompleto: 'Fixture', email: 'fixture@example.com', passwordHash: 'unused-test-hash' });
    token = crearSesion(user);
    const app = express(); app.use(express.json());
    app.use('/api/clientes', require('../dist/routes/cliente.routes').default);
    app.use('/api/pedidos', require('../dist/routes/pedido.routes').default);
    app.use('/api/historial', require('../dist/routes/historial.routes').default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port + '/api';
});
beforeEach(async () => {
    geoResult = null; geoCalls = [];
    cliente = await Cliente.create({ nombre: 'Fixture', apellido: randomBytes(4).toString('hex') });
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    try { if (created) { assertScratch(); await adminDb.getQueryInterface().dropDatabase(databaseName); } }
    finally { await adminDb.close(); }
});

test('migration can be retried and reversed before any client is archived', async () => {
    const qi = db.getQueryInterface();
    await migration.up(qi, Sequelize);
    await migration.down(qi);
    assert.equal((await qi.describeTable('clientes')).deletedAt, undefined);
    await migration.up(qi, Sequelize);
    assert.equal((await qi.describeTable('clientes')).deletedAt.allowNull, true);
});

test('all client routes require authentication', async () => {
    for (const [url, method] of [['/clientes', 'GET'], ['/clientes', 'POST'], ['/clientes/desactivados', 'GET'], ['/clientes/deuda-vieja', 'GET'], [clientUrl(), 'GET'], [clientUrl(), 'PUT'], [clientUrl(), 'DELETE'], [clientUrl('/envases'), 'GET'], [clientUrl('/ubicacion'), 'PUT'], [clientUrl('/visita'), 'PUT']]) {
        assert.equal((await request(url, method, undefined, false)).status, 401);
    }
});

test('malformed ids return 400 and absent valid ids return 404', async () => {
    for (const [suffix, method] of [['', 'GET'], ['', 'PUT'], ['', 'DELETE'], ['/envases', 'GET'], ['/ubicacion', 'PUT'], ['/visita', 'PUT']]) assert.equal((await request('/clientes/invalid' + suffix, method)).status, 400);
    assert.equal((await request('/clientes/11111111-1111-4111-8111-111111111111')).status, 404);
});

test('create validates names, body, enums, lengths and barrio before geocoding', async () => {
    for (const data of [undefined, [], {}, { nombre: ' ', apellido: 'A' }, { nombre: 'A', apellido: '' }, { nombre: 'A', apellido: 'B', categoria: 'bad' }, { nombre: 'A', apellido: 'B', telefono: 123 }, { nombre: 'a'.repeat(101), apellido: 'B' }, { nombre: 'A', apellido: 'B', barrioId: '11111111-1111-4111-8111-111111111111', direccion: 'Address' }]) {
        assert.equal((await request('/clientes', 'POST', data)).status, 400);
    }
    assert.equal(geoCalls.length, 0);
});

test('create normalizes values and returns numeric decimals and nullable optional fields', async () => {
    const result = await request('/clientes', 'POST', { nombre: ' Name ', apellido: ' Last ', latitud: -24.2, longitud: -65.3 });
    assert.equal(result.status, 201);
    assert.equal(result.body.nombre, 'Name');
    assert.equal(result.body.direccion, null);
    assert.equal(result.body.saldoActual, 0);
    const fetched = await request('/clientes/' + result.body.id);
    assert.equal(typeof fetched.body.saldoActual, 'number');
    assert.equal(fetched.body.latitud, -24.2);
    assert.equal(fetched.body.longitud, -65.3);
});

test('update preserves omitted fields but clears explicit null values', async () => {
    const barrio = await Barrio.create({ nombre: randomBytes(8).toString('hex') });
    await cliente.update({ barrioId: barrio.id, direccion: 'Old', telefono: '123', localidad: 'Town', latitud: -24.2, longitud: -65.3 });
    const changed = await request(clientUrl(), 'PUT', { nombre: 'New' });
    assert.equal(changed.body.telefono, '123');
    const cleared = await request(clientUrl(), 'PUT', { barrioId: null, direccion: null, telefono: null, localidad: null });
    assert.equal(cleared.status, 200);
    for (const field of ['barrioId', 'direccion', 'telefono', 'localidad', 'latitud', 'longitud']) assert.equal(cleared.body[field], null);
});

test('update rejects invalid fields without changing persisted data', async () => {
    for (const body of [{ nombre: '' }, { apellido: ' ' }, { nombre: null }, { categoria: 'bad' }, { barrioId: 'bad' }, { localidad: 'x'.repeat(101) }, {}, undefined]) assert.equal((await request(clientUrl(), 'PUT', body)).status, 400);
    await cliente.reload(); assert.equal(cliente.nombre, 'Fixture');
});

test('all write endpoints reject incomplete, nonnumeric and out-of-range coordinates', async () => {
    for (const coords of [{ latitud: 999, longitud: -999 }, { latitud: '1', longitud: 2 }, { latitud: null, longitud: 2 }, { latitud: -24.2 }]) {
        assert.equal((await request('/clientes', 'POST', { nombre: 'A', apellido: 'B', ...coords })).status, 400);
        assert.equal((await request(clientUrl(), 'PUT', coords)).status, 400);
        assert.equal((await request(clientUrl('/ubicacion'), 'PUT', coords)).status, 400);
    }
    assert.equal((await request(clientUrl('/ubicacion'), 'PUT', { latitud: 0, longitud: 0 })).status, 200);
    assert.equal((await request(clientUrl('/ubicacion'), 'PUT', { latitud: null, longitud: null })).status, 200);
});

test('address and locality changes geocode; failures discard the previous coordinates', async () => {
    await cliente.update({ direccion: 'Old', localidad: 'Town', latitud: -24.2, longitud: -65.3 });
    let changed = await request(clientUrl(), 'PUT', { direccion: 'New' });
    assert.equal(changed.status, 200); assert.equal(changed.body.latitud, null); assert.equal(changed.body.longitud, null);
    assert.deepEqual(geoCalls, [['New', 'Town']]);
    geoResult = { latitud: -24.1, longitud: -65.1 };
    changed = await request(clientUrl(), 'PUT', { localidad: 'Other' });
    assert.equal(changed.body.latitud, -24.1); assert.deepEqual(geoCalls.at(-1), ['New', 'Other']);
    geoCalls = [];
    changed = await request(clientUrl(), 'PUT', { direccion: 'Manual', latitud: -24.3, longitud: -65.4 });
    assert.equal(changed.body.latitud, -24.3); assert.equal(geoCalls.length, 0);
});

test('create geocodes only when coordinates were omitted', async () => {
    geoResult = { latitud: -24.2, longitud: -65.3 };
    const created = await request('/clientes', 'POST', { nombre: 'A', apellido: 'B', direccion: 'Address' });
    assert.equal(created.body.latitud, -24.2);
    geoCalls = [];
    const cleared = await request('/clientes', 'POST', { nombre: 'A', apellido: 'B', direccion: 'Address', latitud: null, longitud: null });
    assert.equal(cleared.body.latitud, null); assert.equal(geoCalls.length, 0);
});

test('visit requires a boolean and missing or false-like values do not clear the date', async () => {
    await cliente.update({ ultimaVisitaFecha: '2026-09-01' });
    for (const body of [{}, { visitado: 'false' }, { visitado: 0 }, { visitado: null }, undefined]) assert.equal((await request(clientUrl('/visita'), 'PUT', body)).status, 400);
    await cliente.reload(); assert.equal(cliente.ultimaVisitaFecha, '2026-09-01');
    const cleared = await request(clientUrl('/visita'), 'PUT', { visitado: false });
    assert.equal(cleared.body.ultimaVisitaFecha, null);
});

test('visit uses the Argentina date after 21:00', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-09T01:30:00Z') });
    const result = await request(clientUrl('/visita'), 'PUT', { visitado: true });
    assert.equal(result.status, 200); assert.equal(result.body.ultimaVisitaFecha, '2026-09-08');
});

test('day filter accepts zero, rejects invalid/repeated values, and defaults to 30', async () => {
    await cliente.update({ saldoActual: 100 });
    await Historial.create({ clienteId: cliente.id, usuarioId: user.id, saldoAnterior: 0, importeTotal: 100, montoPagado: 0, saldoFinal: 100, fecha: new Date(Date.now() - 10 * 86400000) });
    assert.ok((await request('/clientes/deuda-vieja?dias=0')).body.some(c => c.id === cliente.id));
    assert.equal((await request('/clientes/deuda-vieja')).body.some(c => c.id === cliente.id), false);
    for (const query of ['-1', 'abc', '1.5', '36501', '', '1&dias=2']) assert.equal((await request('/clientes/deuda-vieja?dias=' + query)).status, 400);
});

test('debt report retains days since last payment semantics', async () => {
    await cliente.update({ saldoActual: 90 });
    const fields = { clienteId: cliente.id, usuarioId: user.id, saldoAnterior: 0, importeTotal: 100, montoPagado: 0, saldoFinal: 100 };
    await Historial.create({ ...fields, fecha: new Date(Date.now() - 60 * 86400000) });
    await Historial.create({ ...fields, importeTotal: 0, montoPagado: 10, saldoFinal: 90, fecha: new Date() });
    const result = await request('/clientes/deuda-vieja?dias=0');
    assert.equal(result.body.find(c => c.id === cliente.id).diasSinPagar, 0);
});

test('pending orders block deletion and remain visible', async () => {
    const pedido = await Pedido.create({ clienteId: cliente.id, usuarioId: user.id, detalle: 'Pending' });
    assert.equal((await request(clientUrl(), 'DELETE')).status, 409);
    assert.ok(await Cliente.findByPk(cliente.id)); assert.ok(await Pedido.findByPk(pedido.id));
});

test('nonzero balances block deletion', async () => {
    for (const saldoActual of [100, -100]) {
        await cliente.update({ saldoActual });
        assert.equal((await request(clientUrl(), 'DELETE')).status, 409);
    }
});

test('outstanding containers do not block soft deletion and remain recorded', async () => {
    const producto = await Producto.create({ nombre: 'Envase pendiente ' + cliente.id });
    const envase = await SaldoEnvase.create({ clienteId: cliente.id, productoId: producto.id, cantidad: 1 });
    assert.equal((await request(clientUrl(), 'DELETE')).status, 204);
    assert.ok((await Cliente.findByPk(cliente.id, { paranoid: false })).deletedAt);
    await envase.reload();
    assert.equal(envase.cantidad, 1);
});

test('archived listing returns only soft-deleted clients', async () => {
    const activo = await Cliente.create({ nombre: 'Activo', apellido: randomBytes(4).toString('hex') });
    assert.equal((await request(clientUrl(), 'DELETE')).status, 204);

    const result = await request('/clientes/desactivados');
    assert.equal(result.status, 200);
    assert.ok(result.body.some(c => c.id === cliente.id && c.deletedAt));
    assert.equal(result.body.some(c => c.id === activo.id), false);
    assert.equal((await request('/clientes')).body.some(c => c.id === cliente.id), false);
});

test('soft deletion preserves settled history, delivered orders and zero container records', async () => {
    const pedido = await Pedido.create({ clienteId: cliente.id, usuarioId: user.id, detalle: 'Done', estado: 'entregado' });
    const history = await Historial.create({ clienteId: cliente.id, usuarioId: user.id, saldoAnterior: 0, importeTotal: 10, montoPagado: 10, saldoFinal: 0 });
    const producto = await Producto.create({ nombre: 'Envase saldado ' + cliente.id });
    const envase = await SaldoEnvase.create({ clienteId: cliente.id, productoId: producto.id, cantidad: 0 });
    assert.equal((await request(clientUrl(), 'DELETE')).status, 204);
    assert.equal(await Cliente.findByPk(cliente.id), null);
    assert.ok((await Cliente.findByPk(cliente.id, { paranoid: false })).deletedAt);
    assert.ok(await Pedido.findByPk(pedido.id)); assert.ok(await Historial.findByPk(history.id)); assert.ok(await SaldoEnvase.findByPk(envase.id));
    assert.equal((await request('/clientes')).body.some(c => c.id === cliente.id), false);
    assert.equal((await request(clientUrl())).status, 404);
    assert.equal((await request(clientUrl(), 'DELETE')).status, 404);
    const histories = await request('/historial?limit=100');
    assert.equal(histories.body.data.find(h => h.id === history.id).cliente.id, cliente.id);
    await assert.rejects(migration.down(db.getQueryInterface()), /dados de baja/);
});

test('archived clients cannot receive new orders or deliveries', async () => {
    await request(clientUrl(), 'DELETE');
    assert.equal((await request(clientUrl(), 'PUT', { nombre: 'New' })).status, 404);
    assert.equal((await request(clientUrl('/visita'), 'PUT', { visitado: true })).status, 404);
    assert.equal((await request(clientUrl('/ubicacion'), 'PUT', { latitud: 0, longitud: 0 })).status, 404);
    assert.equal((await request('/pedidos', 'POST', { clienteId: cliente.id, detalle: 'New' })).status, 404);
    assert.equal((await request('/historial', 'POST', { clienteId: cliente.id, montoPagado: 10 })).status, 404);
});

test('concurrent order creation and deletion do not create hidden pending orders', async () => {
    const [deleted, order] = await Promise.all([request(clientUrl(), 'DELETE'), request('/pedidos', 'POST', { clienteId: cliente.id, detalle: 'Race' })]);
    assert.ok((deleted.status === 204 && order.status === 404) || (deleted.status === 409 && order.status === 201), JSON.stringify([deleted, order]));
    if (order.status === 201) assert.ok(await Cliente.findByPk(cliente.id));
});

test('delivery uses the same commercial date as manual visits', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-09T01:30:00Z') });
    const result = await request('/historial', 'POST', { clienteId: cliente.id, montoPagado: 10 });
    assert.equal(result.status, 201);
    await cliente.reload(); assert.equal(cliente.ultimaVisitaFecha, fechaComercial()); assert.equal(cliente.ultimaVisitaFecha, '2026-09-08');
});

test('database errors use 503/500 and foreign key conflicts use 409', async t => {
    t.mock.method(console, 'error', () => {});
    const finder = t.mock.method(Cliente, 'findAll', async () => { throw new ConnectionError(new Error('offline')); });
    assert.equal((await request('/clientes')).status, 503);
    finder.mock.mockImplementation(async () => { throw new Error('query error'); });
    assert.equal((await request('/clientes')).status, 500);
    t.mock.method(Cliente, 'create', async () => { throw new ForeignKeyConstraintError({}); });
    assert.equal((await request('/clientes', 'POST', { nombre: 'A', apellido: 'B' })).status, 409);
});

test('client reads include barrio and nonzero containers with product data', async () => {
    const barrio = await Barrio.create({ nombre: 'Barrio ' + cliente.id });
    await cliente.update({ barrioId: barrio.id });
    const producto = await Producto.create({ nombre: 'Producto ' + cliente.id });
    const cero = await Producto.create({ nombre: 'Sin saldo ' + cliente.id });
    await SaldoEnvase.create({ clienteId: cliente.id, productoId: producto.id, cantidad: 2 });
    await SaldoEnvase.create({ clienteId: cliente.id, productoId: cero.id, cantidad: 0 });
    const detail = await request(clientUrl());
    assert.equal(detail.body.barrio.id, barrio.id);
    const list = await request('/clientes');
    assert.equal(list.body.find(c => c.id === cliente.id).saldosEnvase.length, 2);
    const envases = await request(clientUrl('/envases'));
    assert.equal(envases.status, 200); assert.equal(envases.body.length, 1);
    assert.equal(envases.body[0].producto.id, producto.id); assert.equal(envases.body[0].cantidad, 2);
});

test('raw debt query excludes archived clients', async () => {
    await cliente.update({ saldoActual: 10 });
    await Historial.create({ clienteId: cliente.id, usuarioId: user.id, saldoAnterior: 0, importeTotal: 10, montoPagado: 0, saldoFinal: 10 });
    await cliente.destroy();
    const result = await request('/clientes/deuda-vieja?dias=0');
    assert.equal(result.status, 200); assert.equal(result.body.some(c => c.id === cliente.id), false);
});
