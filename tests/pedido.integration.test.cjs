const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { Sequelize, ConnectionError } = require('sequelize');
const config = require('../config/config').development;
const databaseName = 'soderia_pedido_test_' + randomBytes(8).toString('hex');
const adminDb = new Sequelize({ ...config, logging: false });
const db = new Sequelize({ ...config, database: databaseName, logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
process.env.JWT_SECRET = 'pedido-integration-tests-only';
require('../dist/models/associations');
const Pedido = require('../dist/models/Pedido').default;
const Cliente = require('../dist/models/Cliente').default;
const Usuario = require('../dist/models/Usuario').default;
const { crearSesion } = require('../dist/services/token.service');
const migration = require('../migrations/20260908050000-harden-pedidos');
let created = false, server, base, token, user, cliente;
const absentId = '11111111-1111-4111-8111-111111111111';
function assertScratch() {
    assert.match(databaseName, /^soderia_pedido_test_[a-f0-9]{16}$/);
    assert.notEqual(databaseName, config.database); assert.equal(db.getDatabaseName(), databaseName);
}
async function request(url, method = 'GET', body, auth = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, body: response.status === 204 ? null : await response.json() };
}
const pedido = (extra = {}) => ({ clienteId: cliente.id, detalle: 'Dos bidones', ...extra });
async function crear(extra = {}) {
    const result = await request('/pedidos', 'POST', pedido(extra));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body;
}
before(async () => {
    assertScratch(); await adminDb.getQueryInterface().createDatabase(databaseName); created = true;
    const directory = path.join(__dirname, '../migrations');
    for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.js')).sort()) await require(path.join(directory, file)).up(db.getQueryInterface(), Sequelize);
    user = await Usuario.create({ username: 'fixture', nombreCompleto: 'Fixture', email: 'fixture@example.com', passwordHash: 'unused-test-hash' });
    token = crearSesion(user);
    const app = express(); app.use(express.json());
    app.use('/api/pedidos', require('../dist/routes/pedido.routes').default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
beforeEach(async () => { cliente = await Cliente.create({ nombre: 'Ana', apellido: 'Test ' + randomBytes(4).toString('hex'), telefono: '123' }); });
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    try { if (created) { assertScratch(); await adminDb.getQueryInterface().dropDatabase(databaseName); } }
    finally { await adminDb.close(); }
});

test('all order routes require authentication and ids must be uuids', async () => {
    for (const [route, method] of [['/pedidos', 'GET'], ['/pedidos', 'POST'], ['/pedidos/' + absentId + '/entregar', 'PUT'], ['/pedidos/' + absentId, 'DELETE']]) {
        assert.equal((await request(route, method, undefined, false)).status, 401);
    }
    assert.equal((await request('/pedidos/abc/entregar', 'PUT')).status, 400);
    assert.equal((await request('/pedidos/abc', 'DELETE')).status, 400);
});
test('create rejects malformed bodies with 400 and unknown or archived clients with 404', async () => {
    const before = await Pedido.count();
    for (const body of [undefined, [], {}, pedido({ clienteId: 'abc' }), pedido({ detalle: 123 }), pedido({ detalle: { a: 1 } }), pedido({ detalle: 'x'.repeat(256) })]) {
        assert.equal((await request('/pedidos', 'POST', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await request('/pedidos', 'POST', pedido({ clienteId: absentId }))).status, 404);
    await cliente.destroy();
    assert.equal((await request('/pedidos', 'POST', pedido())).status, 404);
    assert.equal(await Pedido.count(), before);
});
test('create trims the detail, stores blanks as null, ignores foreign fields and records the user', async () => {
    let creado = await crear({ detalle: '  Tres sifones  ', estado: 'entregado', usuarioId: absentId, fecha: '2000-01-01' });
    assert.equal(creado.detalle, 'Tres sifones'); assert.equal(creado.estado, 'pendiente'); assert.equal(creado.usuarioId, user.id);
    assert.ok(new Date(creado.fecha).getFullYear() >= 2026);
    for (const detalle of [undefined, null, '', '   ']) { creado = await crear({ detalle }); assert.equal(creado.detalle, null); }
});
test('listing defaults to pending orders oldest first, includes the client and validates filters', async () => {
    for (const query of ['estado=otro', 'clienteId=abc', 'estado=']) assert.equal((await request('/pedidos?' + query)).status, 400);
    const viejo = await Pedido.create({ clienteId: cliente.id, usuarioId: user.id, detalle: 'Viejo', fecha: new Date('2026-01-01T10:00:00Z') });
    const nuevo = await crear({ detalle: 'Nuevo' });
    const entregado = await Pedido.create({ clienteId: cliente.id, usuarioId: user.id, detalle: 'Listo', estado: 'entregado' });
    let result = await request('/pedidos?clienteId=' + cliente.id);
    assert.equal(result.status, 200); assert.equal(result.headers.get('x-limite-pedidos'), '1000');
    assert.deepEqual(result.body.map(p => p.id), [viejo.id, nuevo.id]);
    assert.deepEqual(result.body[0].cliente, { id: cliente.id, nombre: 'Ana', apellido: cliente.apellido, telefono: '123' });
    result = await request('/pedidos?estado=entregado&clienteId=' + cliente.id); assert.deepEqual(result.body.map(p => p.id), [entregado.id]);
    result = await request('/pedidos?estado=todos&clienteId=' + cliente.id); assert.equal(result.body.length, 3); assert.equal(result.body[2].id, viejo.id);
    assert.ok((await request('/pedidos')).body.some(p => p.id === nuevo.id));
    assert.ok(!(await request('/pedidos')).body.some(p => p.id === entregado.id));
});
test('delivering an order is done once and archived clients still show on their orders', async () => {
    const creado = await crear();
    assert.equal((await request('/pedidos/' + absentId + '/entregar', 'PUT')).status, 404);
    let result = await request('/pedidos/' + creado.id + '/entregar', 'PUT');
    assert.equal(result.status, 200); assert.equal(result.body.estado, 'entregado');
    result = await request('/pedidos/' + creado.id + '/entregar', 'PUT');
    assert.equal(result.status, 409); assert.match(result.body.error, /ya fue entregado/);
    await cliente.destroy();
    result = await request('/pedidos?estado=entregado&clienteId=' + cliente.id);
    assert.equal(result.body[0].cliente.id, cliente.id);
});
test('only pending orders can be deleted', async () => {
    const creado = await crear();
    assert.equal((await request('/pedidos/' + absentId, 'DELETE')).status, 404);
    assert.equal((await request('/pedidos/' + creado.id, 'DELETE')).status, 204);
    assert.equal((await request('/pedidos/' + creado.id, 'DELETE')).status, 404);
    assert.equal(await Pedido.findByPk(creado.id), null);
    const entregado = await Pedido.create({ clienteId: cliente.id, usuarioId: user.id, estado: 'entregado' });
    assert.equal((await request('/pedidos/' + entregado.id, 'DELETE')).status, 409);
    assert.ok(await Pedido.findByPk(entregado.id));
});
test('concurrent delivery and deletion of the same order never both succeed', async () => {
    const creado = await crear();
    const [entrega, borrado] = await Promise.all([request('/pedidos/' + creado.id + '/entregar', 'PUT'), request('/pedidos/' + creado.id, 'DELETE')]);
    assert.ok((entrega.status === 200 && borrado.status === 409) || (entrega.status === 404 && borrado.status === 204), JSON.stringify([entrega.status, borrado.status]));
});
test('database connection failures return 503 and query failures 500', async t => {
    t.mock.method(console, 'error', () => {});
    const finder = t.mock.method(Pedido, 'findAll', async () => { throw new ConnectionError(new Error('offline')); });
    assert.equal((await request('/pedidos')).status, 503);
    finder.mock.mockImplementation(async () => { throw new Error('query error'); });
    assert.equal((await request('/pedidos')).status, 500);
});
test('migration is idempotent, reversible, normalizes legacy details and adds an index plus a fecha default', async () => {
    const qi = db.getQueryInterface();
    const ids = [randomUUID(), randomUUID()];
    await db.query('INSERT INTO pedidos (id, clienteId, usuarioId, detalle, estado, fecha, createdAt, updatedAt) VALUES (:a, :c, :u, "  con espacios  ", "pendiente", NOW(), NOW(), NOW()), (:b, :c, :u, "   ", "pendiente", NOW(), NOW(), NOW())', {
        replacements: { a: ids[0], b: ids[1], c: cliente.id, u: user.id },
    });
    await migration.up(qi); await migration.down(qi); await migration.up(qi);
    assert.ok((await qi.showIndex('pedidos')).some(i => i.name === 'pedidos_estado_fecha'));
    assert.equal((await Pedido.findByPk(ids[0])).detalle, 'con espacios'); assert.equal((await Pedido.findByPk(ids[1])).detalle, null);
    const sinFecha = randomUUID();
    await db.query('INSERT INTO pedidos (id, clienteId, usuarioId, createdAt, updatedAt) VALUES (:id, :c, :u, NOW(), NOW())', { replacements: { id: sinFecha, c: cliente.id, u: user.id } });
    const saved = await Pedido.findByPk(sinFecha);
    assert.ok(saved.fecha instanceof Date && !Number.isNaN(saved.fecha.getTime())); assert.equal(saved.estado, 'pendiente');
});
