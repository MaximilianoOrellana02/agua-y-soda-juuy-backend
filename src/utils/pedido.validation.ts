import { esUuid } from './cliente.validation';

export const ESTADOS_PEDIDO = ['pendiente', 'entregado'] as const;
export type EstadoPedido = typeof ESTADOS_PEDIDO[number];
export const DETALLE_MAXIMO = 255;
export const LIMITE_PEDIDOS = 1000;

export class DatosPedidoInvalidos extends Error {}
// Operacion valida en forma pero imposible con el estado actual (pedido ya entregado).
export class ConflictoPedido extends Error {}

export interface PedidoInput { clienteId: string; detalle: string | null; }
export interface FiltrosPedidos { estado?: EstadoPedido; clienteId?: string; }

function tieneCampo(body: Record<string, unknown>, campo: string): boolean {
    return Object.prototype.hasOwnProperty.call(body, campo) && body[campo] !== undefined;
}

function cuerpo(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DatosPedidoInvalidos('El cuerpo debe ser un objeto JSON');
    return value as Record<string, unknown>;
}

// El detalle es opcional: vacio o solo espacios se guarda como null; si viene, es texto recortado de hasta 255.
export function detallePedido(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') throw new DatosPedidoInvalidos(`detalle debe ser un texto de hasta ${DETALLE_MAXIMO} caracteres`);
    const texto = value.trim();
    if (texto.length > DETALLE_MAXIMO) throw new DatosPedidoInvalidos(`detalle debe ser un texto de hasta ${DETALLE_MAXIMO} caracteres`);
    return texto || null;
}

export function estadoPedido(value: unknown): EstadoPedido {
    if (typeof value !== 'string' || !ESTADOS_PEDIDO.includes(value as EstadoPedido)) {
        throw new DatosPedidoInvalidos('estado debe ser "pendiente" o "entregado"');
    }
    return value as EstadoPedido;
}

export function validarPedido(value: unknown): PedidoInput {
    const body = cuerpo(value);
    if (!esUuid(body.clienteId)) throw new DatosPedidoInvalidos('clienteId debe ser un UUID');
    return { clienteId: body.clienteId, detalle: detallePedido(body.detalle) };
}

// Express 5 entrega req.query con strings, arrays u objetos; solo se aceptan strings simples.
// Sin estado se listan los pendientes; estado=todos devuelve pendientes y entregados.
export function validarFiltrosPedidos(value: unknown): FiltrosPedidos {
    const query = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const filtros: FiltrosPedidos = { estado: 'pendiente' };
    if (tieneCampo(query, 'estado')) {
        if (query.estado === 'todos') delete filtros.estado;
        else filtros.estado = estadoPedido(query.estado);
    }
    if (tieneCampo(query, 'clienteId')) {
        if (!esUuid(query.clienteId)) throw new DatosPedidoInvalidos('clienteId debe ser un UUID');
        filtros.clienteId = query.clienteId;
    }
    return filtros;
}
