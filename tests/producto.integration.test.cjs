const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { Sequelize, ConnectionError } = require('sequelize');
const config = require('../config/config').development;
const databaseName = 'soderia_producto_test_' + randomBytes(8).toString('hex');
const adminDb = new Sequelize({ ...config, logging: false });
const db = new Sequelize({ ...config, database: databaseName, logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
process.env.JWT_SECRET = 'producto-integration-tests-only';
require('../dist/models/associations');
const Producto = require('../dist/models/Producto').default;
const PrecioProducto = require('../dist/models/PrecioProducto').default;
const Usuario = require('../dist/models/Usuario').default;
const { crearSesion } = require('../dist/services/token.service');
const { precioVigente } = require('../dist/services/producto.service');
const migration = require('../migrations/20260908040000-harden-productos');
let created = false, server, base, token;
const absentId = '11111111-1111-4111-8111-111111111111';
const uniqueName = () => 'Producto ' + randomBytes(8).toString('hex');
function assertScratch() {
    assert.match(databaseName, /^soderia_producto_test_[a-f0-9]{16}$/);
    assert.notEqual(databaseName, config.database); assert.equal(db.getDatabaseName(), databaseName);
}
async function request(url, method = 'GET', body, auth = true) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
const alta = (extra = {}) => ({ nombre: uniqueName(), precioParticular: 100, precioConfianza: 90, ...extra });
async function crear(extra = {}) {
    const result = await request('/productos', 'POST', alta(extra));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body;
}
const preciosDe = producto => Object.fromEntries(producto.precios.map(p => [p.tipoCliente, p.precio]));
before(async () => {
    assertScratch(); await adminDb.getQueryInterface().createDatabase(databaseName); created = true;
    const directory = path.join(__dirname, '../migrations');
    for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.js')).sort()) await require(path.join(directory, file)).up(db.getQueryInterface(), Sequelize);
    const user = await Usuario.create({ username: 'fixture', nombreCompleto: 'Fixture', email: 'fixture@example.com', passwordHash: 'unused-test-hash' });
    token = crearSesion(user);
    const app = express(); app.use(express.json());
    app.use('/api/productos', require('../dist/routes/producto.routes').default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    try { if (created) { assertScratch(); await adminDb.getQueryInterface().dropDatabase(databaseName); } }
    finally { await adminDb.close(); }
});

test('all product routes require authentication and ids must be uuids', async () => {
    for (const [route, method] of [['/productos', 'GET'], ['/productos', 'POST'], ['/productos/' + absentId, 'PUT'], ['/productos/' + absentId, 'DELETE'], ['/productos/' + absentId + '/precio', 'PUT']]) {
        assert.equal((await request(route, method, undefined, false)).status, 401);
    }
    for (const [route, method, body] of [['/productos/abc', 'PUT', { nombre: 'x' }], ['/productos/abc', 'DELETE'], ['/productos/abc/precio', 'PUT', { tipoCliente: 'particular', precio: 1 }]]) {
        assert.equal((await request(route, method, body)).status, 400);
    }
});
test('create rejects malformed bodies with 400 without leaving products or prices behind', async () => {
    const productos = await Producto.count(), precios = await PrecioProducto.count();
    for (const body of [undefined, [], {}, alta({ nombre: '' }), alta({ nombre: 123 }), alta({ precioParticular: 'abc' }), alta({ precioParticular: -5 }),
        alta({ precioConfianza: 0 }), alta({ precioConfianza: 1.005 }), alta({ esRetornable: 'si' }), alta({ stockMinimo: -3 }), alta({ stockMinimo: '2' })]) {
        assert.equal((await request('/productos', 'POST', body)).status, 400, JSON.stringify(body));
    }
    assert.equal(await Producto.count(), productos); assert.equal(await PrecioProducto.count(), precios);
});
test('create trims the name, stores both prices atomically and returns them as numbers', async () => {
    const nombre = uniqueName();
    const producto = await crear({ nombre: '  ' + nombre + '  ', precioParticular: 150.5, precioConfianza: 120, esRetornable: false, stockMinimo: 3 });
    assert.equal(producto.nombre, nombre); assert.equal(producto.esRetornable, false); assert.equal(producto.stockMinimo, 3); assert.equal(producto.activo, true);
    assert.deepEqual(preciosDe(producto), { particular: 150.5, confianza: 120 });
    assert.equal(await PrecioProducto.count({ where: { productoId: producto.id } }), 2);
});
test('duplicate names are rejected with 409 regardless of case, also under concurrency', async () => {
    const producto = await crear();
    for (const nombre of [producto.nombre, producto.nombre.toUpperCase(), '  ' + producto.nombre + ' ']) assert.equal((await request('/productos', 'POST', alta({ nombre }))).status, 409);
    const nombre = uniqueName();
    const results = await Promise.all(Array.from({ length: 3 }, () => request('/productos', 'POST', alta({ nombre }))));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409, 409]);
    assert.equal(await Producto.count({ where: { nombre } }), 1);
});
test('price changes are validated, appended to the history and the newest one wins', async () => {
    const producto = await crear();
    for (const body of [undefined, {}, { tipoCliente: 'mayorista', precio: 10 }, { tipoCliente: 'particular', precio: 'abc' }, { tipoCliente: 'particular', precio: -1 }, { tipoCliente: 'particular', precio: 0 }]) {
        assert.equal((await request('/productos/' + producto.id + '/precio', 'PUT', body)).status, 400);
    }
    assert.equal((await request('/productos/' + absentId + '/precio', 'PUT', { tipoCliente: 'particular', precio: 10 })).status, 404);
    for (const precio of [110, 120, 130.75]) {
        const result = await request('/productos/' + producto.id + '/precio', 'PUT', { tipoCliente: 'particular', precio });
        assert.equal(result.status, 201); assert.equal(result.body.precio, precio); assert.equal(result.body.tipoCliente, 'particular');
    }
    assert.equal(await PrecioProducto.count({ where: { productoId: producto.id } }), 5);
    const listado = (await request('/productos')).body.find(p => p.id === producto.id);
    assert.equal(listado.precios.length, 2); assert.deepEqual(preciosDe(listado), { particular: 130.75, confianza: 90 });
    assert.equal((await precioVigente(producto.id, 'particular')).precio, 130.75);
    assert.equal((await precioVigente(producto.id, 'confianza')).precio, 90);
});
test('updates validate fields, keep omitted values, reject duplicates and never touch prices', async () => {
    const producto = await crear(), otro = await crear();
    for (const body of [undefined, {}, { nombre: '' }, { stockMinimo: -7 }, { esRetornable: 'no' }, { activo: 'true' }, { precioParticular: 10 }]) {
        assert.equal((await request('/productos/' + producto.id, 'PUT', body)).status, 400);
    }
    assert.equal((await request('/productos/' + absentId, 'PUT', { nombre: 'x' })).status, 404);
    assert.equal((await request('/productos/' + producto.id, 'PUT', { nombre: otro.nombre.toUpperCase() })).status, 409);
    const result = await request('/productos/' + producto.id, 'PUT', { nombre: '  Renombrado ' + producto.nombre + ' ', stockMinimo: 5 });
    assert.equal(result.status, 200); assert.equal(result.body.nombre, 'Renombrado ' + producto.nombre); assert.equal(result.body.stockMinimo, 5);
    assert.equal(result.body.esRetornable, true); assert.deepEqual(preciosDe(result.body), { particular: 100, confianza: 90 });
    assert.equal((await request('/productos/' + producto.id, 'PUT', { nombre: producto.nombre.toUpperCase().replace('PRODUCTO', 'Renombrado Producto') })).status, 200);
});
test('deactivation hides the product, blocks price changes and can be undone through activo', async () => {
    const producto = await crear();
    assert.equal((await request('/productos/' + absentId, 'DELETE')).status, 404);
    assert.equal((await request('/productos/' + producto.id, 'DELETE')).status, 204);
    assert.equal((await request('/productos/' + producto.id, 'DELETE')).status, 409);
    assert.equal((await request('/productos/' + producto.id + '/precio', 'PUT', { tipoCliente: 'particular', precio: 10 })).status, 409);
    assert.ok(!(await request('/productos')).body.some(p => p.id === producto.id));
    assert.equal((await request('/productos?incluirInactivos=si')).status, 400);
    const inactivo = (await request('/productos?incluirInactivos=true')).body.find(p => p.id === producto.id);
    assert.equal(inactivo.activo, false); assert.equal(inactivo.precios.length, 2);
    const result = await request('/productos/' + producto.id, 'PUT', { activo: true });
    assert.equal(result.status, 200); assert.equal(result.body.activo, true);
    assert.ok((await request('/productos')).body.some(p => p.id === producto.id));
});
test('creating a product with the name of a deactivated one reactivates it with the new data and prices', async () => {
    const producto = await crear({ esRetornable: true, stockMinimo: 2 });
    assert.equal((await request('/productos/' + producto.id, 'DELETE')).status, 204);
    const result = await request('/productos', 'POST', alta({ nombre: producto.nombre.toUpperCase(), esRetornable: false, precioParticular: 200, precioConfianza: 180 }));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.id, producto.id); assert.equal(result.body.activo, true); assert.equal(result.body.esRetornable, false);
    assert.equal(result.body.nombre, producto.nombre.toUpperCase()); assert.equal(result.body.stockMinimo, 2);
    assert.deepEqual(preciosDe(result.body), { particular: 200, confianza: 180 });
    assert.equal(await PrecioProducto.count({ where: { productoId: producto.id } }), 4);
    assert.equal(await Producto.count({ where: { nombre: producto.nombre.toUpperCase() } }), 1);
    assert.equal((await request('/productos', 'POST', alta({ nombre: producto.nombre }))).status, 409);
});
test('listing is ordered by name and returns only the current price per client type', async () => {
    const a = await crear({ nombre: 'AAA ' + uniqueName() }), b = await crear({ nombre: 'AAB ' + uniqueName() });
    const listado = (await request('/productos')).body;
    const ids = listado.map(p => p.id);
    assert.ok(ids.indexOf(a.id) < ids.indexOf(b.id));
    for (const producto of listado) {
        assert.equal(producto.precios.length, 2);
        assert.deepEqual(producto.precios.map(p => p.tipoCliente).sort(), ['confianza', 'particular']);
        for (const precio of producto.precios) assert.equal(typeof precio.precio, 'number');
    }
});
test('database connection failures return 503 and query failures 500', async t => {
    t.mock.method(console, 'error', () => {});
    const finder = t.mock.method(Producto, 'findAll', async () => { throw new ConnectionError(new Error('offline')); });
    assert.equal((await request('/productos')).status, 503);
    finder.mock.mockImplementation(async () => { throw new Error('query error'); });
    assert.equal((await request('/productos')).status, 500);
});
test('migration is idempotent, reversible, keeps milliseconds in fechaDesde and rejects bad legacy data', async () => {
    const qi = db.getQueryInterface();
    await migration.up(qi); await migration.down(qi); await migration.up(qi);
    assert.ok((await qi.showIndex('precios_producto')).some(i => i.name === 'precios_producto_producto_tipo_fecha'));
    assert.match((await qi.describeTable('precios_producto')).fechaDesde.type, /^DATETIME\(3\)$/i);
    const producto = await crear();
    await db.query('INSERT INTO precios_producto (id, productoId, tipoCliente, precio, createdAt, updatedAt) VALUES (:id, :p, "particular", 5, NOW(), NOW())', {
        replacements: { id: randomUUID(), p: producto.id },
    });
    const vigente = await precioVigente(producto.id, 'particular');
    assert.equal(vigente.precio, 5); assert.ok(vigente.fechaDesde instanceof Date && !Number.isNaN(vigente.fechaDesde.getTime()));
    const precio = await PrecioProducto.create({ productoId: producto.id, tipoCliente: 'particular', precio: 7, fechaDesde: new Date('2030-01-01T00:00:00.123Z') });
    await precio.reload(); assert.equal(precio.fechaDesde.getMilliseconds(), 123);
    const negativo = randomUUID();
    await db.query('INSERT INTO precios_producto (id, productoId, tipoCliente, precio, createdAt, updatedAt) VALUES (:id, :p, "particular", -1, NOW(), NOW())', { replacements: { id: negativo, p: producto.id } });
    await assert.rejects(migration.up(qi), /precios no positivos/);
    await db.query('DELETE FROM precios_producto WHERE id = :id', { replacements: { id: negativo } });
    await db.query('UPDATE productos SET nombre = "   " WHERE id = :id', { replacements: { id: producto.id } });
    await assert.rejects(migration.up(qi), /nombres vacios/);
    await db.query('UPDATE productos SET nombre = :nombre WHERE id = :id', { replacements: { nombre: '  ' + producto.nombre + '  ', id: producto.id } });
    await migration.up(qi);
    assert.equal((await Producto.findByPk(producto.id)).nombre, producto.nombre);
});
