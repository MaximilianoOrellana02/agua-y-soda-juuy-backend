import { esUuid } from './cliente.validation';
import { cantidadStock, DatosStockInvalidos, motivoStock } from './stock.validation';

export const TIPOS_MOVIMIENTO_CAMIONETA = ['carga', 'descarga'] as const;
export type TipoMovimientoCamioneta = typeof TIPOS_MOVIMIENTO_CAMIONETA[number];

export interface CamionetaInput {
    nombre?: string;
    patente?: string | null;
    activa?: boolean;
}

export interface MovimientoCamionetaInput {
    productoId: string;
    tipo: TipoMovimientoCamioneta;
    cantidad: number;
    motivo: string | null;
    // true: la carga sale del deposito / la descarga vuelve al deposito. false: no toca el stock general.
    afectaStockGeneral: boolean;
}

function cuerpo(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DatosStockInvalidos('El cuerpo debe ser un objeto JSON');
    return value as Record<string, unknown>;
}

function tieneCampo(body: Record<string, unknown>, campo: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, campo) && body[campo] !== undefined;
}

function nombreCamioneta(value: unknown): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) {
        throw new DatosStockInvalidos('El nombre debe ser un texto de entre 1 y 60 caracteres');
    }
    return value.trim();
}

function patenteCamioneta(value: unknown): string | null {
    if (value === null || (typeof value === 'string' && !value.trim())) return null;
    if (typeof value !== 'string' || value.trim().length > 15) throw new DatosStockInvalidos('patente debe ser un texto de hasta 15 caracteres');
    return value.trim().toUpperCase();
}

export function validarCamioneta(value: unknown, crear: boolean): CamionetaInput {
    const body = cuerpo(value);
    const datos: CamionetaInput = {};
    if (crear || tieneCampo(body, 'nombre')) datos.nombre = nombreCamioneta(body.nombre);
    if (tieneCampo(body, 'patente')) datos.patente = patenteCamioneta(body.patente);
    if (tieneCampo(body, 'activa')) {
        if (typeof body.activa !== 'boolean') throw new DatosStockInvalidos('activa debe ser true o false');
        datos.activa = body.activa;
    }
    if (!crear && !Object.keys(datos).length) throw new DatosStockInvalidos('No hay campos para actualizar');
    return datos;
}

function afectaStock(body: Record<string, unknown>): boolean {
    if (!tieneCampo(body, 'afectaStockGeneral')) return true;
    if (typeof body.afectaStockGeneral !== 'boolean') throw new DatosStockInvalidos('afectaStockGeneral debe ser true o false');
    return body.afectaStockGeneral;
}

export function validarMovimientoCamioneta(value: unknown): MovimientoCamionetaInput {
    const body = cuerpo(value);
    if (!esUuid(body.productoId)) throw new DatosStockInvalidos('productoId debe ser un UUID');
    if (typeof body.tipo !== 'string' || !(TIPOS_MOVIMIENTO_CAMIONETA as readonly string[]).includes(body.tipo)) {
        throw new DatosStockInvalidos('tipo debe ser carga o descarga');
    }
    const tipo = body.tipo as TipoMovimientoCamioneta;
    const afectaStockGeneral = afectaStock(body);
    // Una descarga que no vuelve al deposito es mercaderia que se pierde (rotura, merma): exige motivo.
    const sacaDelSistema = tipo === 'descarga' && !afectaStockGeneral;
    return {
        productoId: body.productoId,
        tipo,
        cantidad: cantidadStock(body.cantidad),
        motivo: motivoStock(body.motivo, sacaDelSistema ? 'salida' : 'entrada'),
        afectaStockGeneral,
    };
}

export const ITEMS_CARGA_MAXIMO = 50;

export interface CargaCamionetaInput {
    items: { productoId: string; cantidad: number }[];
    motivo: string | null;
    afectaStockGeneral: boolean;
}

// Carga de varios productos de una vez: { items: [{ productoId, cantidad }], afectaStockGeneral?, motivo? }.
export function validarCargaCamioneta(value: unknown): CargaCamionetaInput {
    const body = cuerpo(value);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > ITEMS_CARGA_MAXIMO) {
        throw new DatosStockInvalidos(`items debe ser una lista de 1 a ${ITEMS_CARGA_MAXIMO} productos`);
    }
    const items = body.items.map((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new DatosStockInvalidos('Cada item debe ser un objeto');
        const { productoId, cantidad } = item as Record<string, unknown>;
        if (!esUuid(productoId)) throw new DatosStockInvalidos('productoId debe ser un UUID');
        return { productoId, cantidad: cantidadStock(cantidad) };
    });
    if (new Set(items.map(i => i.productoId)).size !== items.length) {
        throw new DatosStockInvalidos('Cada producto puede aparecer una sola vez');
    }
    return { items, motivo: motivoStock(body.motivo, 'entrada'), afectaStockGeneral: afectaStock(body) };
}
