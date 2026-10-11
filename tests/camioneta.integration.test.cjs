const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const { Sequelize } = require('sequelize');
const config = require('../config/config').development;
const databaseName = 'soderia_camioneta_test_' + randomBytes(8).toString('hex');
const adminDb = new Sequelize({ ...config, logging: false });
const db = new Sequelize({ ...config, database: databaseName, logging: false });
const databasePath = require.resolve('../dist/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { __esModule: true, default: db } };
process.env.JWT_SECRET = 'camioneta-integration-tests-only';
require('../dist/models/associations');
const Camioneta = require('../dist/models/Camioneta').default;
const StockCamioneta = require('../dist/models/StockCamioneta').default;
const MovimientoStock = require('../dist/models/MovimientoStock').default;
const Historial = require('../dist/models/Historial').default;
const Producto = require('../dist/models/Producto').default;
const PrecioProducto = require('../dist/models/PrecioProducto').default;
const Cliente = require('../dist/models/Cliente').default;
const Usuario = require('../dist/models/Usuario').default;
const { crearSesion } = require('../dist/services/token.service');
let created = false, server, base, admin, repartidor, camioneta, producto, cliente;
const absentId = '11111111-1111-4111-8111-111111111111';
const hex = () => randomBytes(4).toString('hex');
function assertScratch() {
    assert.match(databaseName, /^soderia_camioneta_test_[a-f0-9]{16}$/);
    assert.notEqual(databaseName, config.database); assert.equal(db.getDatabaseName(), databaseName);
}
async function request(url, method = 'GET', body, token = admin) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetch(base + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
const mover = (extra = {}, token = admin) =>
    request(`/camionetas/${camioneta.id}/movimientos`, 'POST', { productoId: producto.id, tipo: 'carga', cantidad: 4, ...extra }, token);
async function stockCamioneta() {
    const fila = await StockCamioneta.findOne({ where: { camionetaId: camioneta.id, productoId: producto.id } });
    return fila ? fila.cantidad : 0;
}
async function stockGeneral() { await producto.reload(); return producto.stockActual; }

before(async () => {
    assertScratch(); await adminDb.getQueryInterface().createDatabase(databaseName); created = true;
    const directory = path.join(__dirname, '../migrations');
    for (const file of fs.readdirSync(directory).filter(f => f.endsWith('.js')).sort()) await require(path.join(directory, file)).up(db.getQueryInterface(), Sequelize);
    const usuarioAdmin = await Usuario.create({ username: 'admin', nombreCompleto: 'Admin', email: 'admin@example.com', passwordHash: 'unused', rol: 'admin' });
    const usuarioRepartidor = await Usuario.create({ username: 'driver', nombreCompleto: 'Driver', email: 'driver@example.com', passwordHash: 'unused' });
    admin = crearSesion(usuarioAdmin); repartidor = crearSesion(usuarioRepartidor);
    const app = express(); app.use(express.json());
    app.use('/api/camionetas', require('../dist/routes/camioneta.routes').default);
    app.use('/api/historial', require('../dist/routes/historial.routes').default);
    app.use('/api/stock', require('../dist/routes/stock.routes').default);
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
beforeEach(async () => {
    camioneta = await Camioneta.create({ nombre: 'Camioneta ' + hex() });
    producto = await Producto.create({ nombre: 'Producto ' + hex(), stockActual: 10 });
    await PrecioProducto.bulkCreate([{ productoId: producto.id, tipoCliente: 'particular', precio: 100 }, { productoId: producto.id, tipoCliente: 'confianza', precio: 90 }]);
    cliente = await Cliente.create({ nombre: 'Ana', apellido: 'Test ' + hex(), tipoCliente: 'particular' });
});
after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close();
    try { if (created) { assertScratch(); await adminDb.getQueryInterface().dropDatabase(databaseName); } }
    finally { await adminDb.close(); }
});

test('only admins create and edit trucks; everyone authenticated can list them', async () => {
    assert.equal((await request('/camionetas', 'GET', undefined, null)).status, 401);
    assert.equal((await request('/camionetas', 'POST', { nombre: 'X' }, repartidor)).status, 403);
    assert.equal((await request(`/camionetas/${camioneta.id}`, 'PUT', { activa: false }, repartidor)).status, 403);
    const creada = await request('/camionetas', 'POST', { nombre: ' Nueva ' + hex() + ' ', patente: 'ab123cd' });
    assert.equal(creada.status, 201); assert.equal(creada.body.patente, 'AB123CD');
    assert.equal((await request('/camionetas', 'POST', { nombre: creada.body.nombre })).status, 409);
    assert.equal((await request('/camionetas/abc', 'PUT', { activa: false })).status, 400);
    assert.equal((await request(`/camionetas/${absentId}`, 'PUT', { activa: false })).status, 404);
    assert.equal((await request(`/camionetas/${creada.body.id}`, 'PUT', { activa: false })).status, 200);
    const lista = await request('/camionetas', 'GET', undefined, repartidor);
    assert.equal(lista.status, 200);
    assert.ok(lista.body.some(c => c.id === camioneta.id)); assert.ok(!lista.body.some(c => c.id === creada.body.id));
});

test('loading a truck moves stock out of the depot and unloading brings it back', async () => {
    let result = await mover({}, repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.stockCamioneta, 4); assert.equal(result.body.stockGeneral, 6);
    assert.deepEqual(result.body.movimientos.map(m => [m.tipo, m.camionetaId]), [['entrada', camioneta.id], ['salida', null]]);
    result = await mover({ tipo: 'descarga', cantidad: 3 }, repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.stockCamioneta, 1); assert.equal(result.body.stockGeneral, 9);
    assert.equal(await MovimientoStock.count({ where: { productoId: producto.id } }), 4);
    const stock = await request(`/camionetas/${camioneta.id}/stock`, 'GET', undefined, repartidor);
    assert.equal(stock.status, 200); assert.equal(stock.body.stock[0].cantidad, 1); assert.equal(stock.body.stock[0].producto.nombre, producto.nombre);
    const depot = await request('/stock/movimientos?camionetaId=deposito&productoId=' + producto.id);
    assert.deepEqual(depot.body.map(m => m.tipo), ['entrada', 'salida']);
    const truck = await request(`/stock/movimientos?camionetaId=${camioneta.id}`);
    assert.deepEqual(truck.body.map(m => [m.tipo, m.camioneta.nombre]), [['salida', camioneta.nombre], ['entrada', camioneta.nombre]]);
});

test('anyone can move truck stock without touching the general stock', async () => {
    let result = await mover({ cantidad: 20, afectaStockGeneral: false }, repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.stockCamioneta, 20); assert.equal(result.body.stockGeneral, 10);
    assert.equal(result.body.movimientos.length, 1);
    assert.equal((await mover({ tipo: 'descarga', cantidad: 2, afectaStockGeneral: false })).status, 400);
    result = await mover({ tipo: 'descarga', cantidad: 2, afectaStockGeneral: false, motivo: 'Rotura' });
    assert.equal(result.status, 201); assert.equal(result.body.stockCamioneta, 18); assert.equal(result.body.stockGeneral, 10);
});

test('loading several products at once applies all of them or none', async () => {
    const otro = await Producto.create({ nombre: 'Producto ' + hex(), stockActual: 5 });
    const cargar = (body, token = repartidor) => request(`/camionetas/${camioneta.id}/carga`, 'POST', body, token);
    for (const body of [{}, { items: [] }, { items: [{ productoId: 'abc', cantidad: 1 }] }, { items: [{ productoId: producto.id, cantidad: 0 }] },
        { items: [{ productoId: producto.id, cantidad: 1 }, { productoId: producto.id, cantidad: 2 }] },
        { items: [{ productoId: producto.id, cantidad: 1 }], afectaStockGeneral: 'no' }]) {
        assert.equal((await cargar(body)).status, 400, JSON.stringify(body));
    }
    // El segundo producto no alcanza: no se carga ninguno.
    let result = await cargar({ items: [{ productoId: producto.id, cantidad: 4 }, { productoId: otro.id, cantidad: 6 }] });
    assert.equal(result.status, 409); assert.match(result.body.error, new RegExp(otro.nombre));
    assert.equal(await stockCamioneta(), 0); assert.equal(await stockGeneral(), 10);
    assert.equal(await MovimientoStock.count({ where: { camionetaId: camioneta.id } }), 0);
    assert.equal((await cargar({ items: [{ productoId: absentId, cantidad: 1 }] })).status, 404);

    result = await cargar({ items: [{ productoId: producto.id, cantidad: 4 }, { productoId: otro.id, cantidad: 5 }] });
    assert.equal(result.status, 201); assert.equal(result.body.afectaStockGeneral, true);
    const linea = (id) => result.body.lineas.find(l => l.productoId === id);
    assert.equal(linea(producto.id).stockCamioneta, 4); assert.equal(linea(producto.id).stockGeneral, 6);
    assert.equal(linea(otro.id).stockCamioneta, 5); assert.equal(linea(otro.id).stockGeneral, 0);

    // Sin descontar del deposito: no hay tope de stock general y no se toca.
    result = await cargar({ items: [{ productoId: otro.id, cantidad: 30 }], afectaStockGeneral: false });
    assert.equal(result.status, 201); assert.equal(result.body.lineas[0].stockCamioneta, 35); assert.equal(result.body.lineas[0].stockGeneral, 0);
    assert.equal(result.body.lineas[0].movimientos.length, 1);
});

test('moves never leave negative stock and reject inactive trucks, products and unknown ids', async () => {
    assert.equal((await mover({ cantidad: 11 })).status, 409);
    assert.equal((await mover({ tipo: 'descarga', cantidad: 1 })).status, 409);
    assert.equal((await mover({ productoId: absentId })).status, 404);
    assert.equal((await request(`/camionetas/${absentId}/movimientos`, 'POST', { productoId: producto.id, tipo: 'carga', cantidad: 1 })).status, 404);
    await producto.update({ activo: false });
    assert.equal((await mover()).status, 409);
    await producto.update({ activo: true }); await camioneta.update({ activa: false });
    assert.equal((await mover()).status, 409);
    assert.equal(await stockCamioneta(), 0); assert.equal(await stockGeneral(), 10);
    assert.equal(await MovimientoStock.count({ where: { productoId: producto.id } }), 0);
});

test('concurrent loads are serialized and keep depot and truck consistent', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => mover({ cantidad: 3 })));
    const ok = results.filter(r => r.status === 201).length;
    assert.equal(ok, 3); assert.equal(results.filter(r => r.status === 409).length, 2);
    assert.equal(await stockCamioneta(), 9); assert.equal(await stockGeneral(), 1);
    assert.equal(await StockCamioneta.count({ where: { camionetaId: camioneta.id } }), 1);
});

test('deliveries use the truck chosen today, an explicit truck, or the depot', async () => {
    await mover({ cantidad: 5 });
    const entrega = (extra = {}) => ({ clienteId: cliente.id, detalles: [{ productoId: producto.id, cantidadEntregada: 2 }], ...extra });
    // Sin camioneta elegida: sale del deposito.
    let result = await request('/historial', 'POST', entrega(), repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.historial.camionetaId, null);
    assert.equal(await stockGeneral(), 3); assert.equal(await stockCamioneta(), 5);
    // Elige camioneta: las entregas siguientes descuentan de ella.
    assert.equal((await request(`/camionetas/${camioneta.id}/elegir`, 'POST', undefined, repartidor)).status, 200);
    assert.equal((await request('/camionetas/mia', 'GET', undefined, repartidor)).body.camioneta.id, camioneta.id);
    result = await request('/historial', 'POST', entrega(), repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.historial.camionetaId, camioneta.id);
    assert.equal(await stockCamioneta(), 3); assert.equal(await stockGeneral(), 3);
    const movimiento = await MovimientoStock.findOne({ where: { productoId: producto.id, motivo: 'Entrega a cliente', camionetaId: camioneta.id } });
    assert.ok(movimiento);
    // Mas de lo que lleva la camioneta: 409 sin tocar nada, aunque el deposito tenga.
    result = await request('/historial', 'POST', entrega({ detalles: [{ productoId: producto.id, cantidadEntregada: 4 }] }), repartidor);
    assert.equal(result.status, 409); assert.match(result.body.error, /camioneta/);
    assert.equal(await stockCamioneta(), 3); assert.equal(await Historial.count({ where: { clienteId: cliente.id } }), 2);
    // null explicito fuerza el deposito aunque haya camioneta elegida.
    result = await request('/historial', 'POST', entrega({ camionetaId: null }), repartidor);
    assert.equal(result.status, 201); assert.equal(await stockGeneral(), 1); assert.equal(await stockCamioneta(), 3);
    // Camioneta explicita inexistente o desactivada.
    assert.equal((await request('/historial', 'POST', entrega({ camionetaId: absentId }))).status, 404);
    await camioneta.update({ activa: false });
    assert.equal((await request('/historial', 'POST', entrega({ camionetaId: camioneta.id }))).status, 409);
    assert.equal((await request(`/camionetas/${camioneta.id}/elegir`, 'POST', undefined, repartidor)).status, 409);
});

test('leaving the chosen truck sends deliveries back to the depot', async () => {
    await mover({ cantidad: 5 });
    assert.equal((await request(`/camionetas/${camioneta.id}/elegir`, 'POST', undefined, repartidor)).status, 200);
    const result = await request('/camionetas/mia', 'DELETE', undefined, repartidor);
    assert.equal(result.status, 200); assert.equal(result.body.camioneta, null);
    assert.equal((await request('/camionetas/mia', 'GET', undefined, repartidor)).body.camioneta, null);
    const entrega = await request('/historial', 'POST', { clienteId: cliente.id, detalles: [{ productoId: producto.id, cantidadEntregada: 1 }] }, repartidor);
    assert.equal(entrega.status, 201); assert.equal(entrega.body.historial.camionetaId, null);
    assert.equal(await stockCamioneta(), 5); assert.equal(await stockGeneral(), 4);
});

test('a truck chosen on a previous day is ignored', async () => {
    await mover({ cantidad: 5 });
    const usuario = await Usuario.findOne({ where: { username: 'driver' } });
    await usuario.update({ camionetaActivaId: camioneta.id, camionetaActivaFecha: '2000-01-01' });
    assert.equal((await request('/camionetas/mia', 'GET', undefined, repartidor)).body.camioneta, null);
    const result = await request('/historial', 'POST', { clienteId: cliente.id, detalles: [{ productoId: producto.id, cantidadEntregada: 1 }] }, repartidor);
    assert.equal(result.status, 201); assert.equal(result.body.historial.camionetaId, null);
    assert.equal(await stockCamioneta(), 5); assert.equal(await stockGeneral(), 4);
});
