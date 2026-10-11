import { Transaction } from "sequelize";
import Camioneta from "../models/Camioneta";
import StockCamioneta from "../models/StockCamioneta";
import Usuario from "../models/Usuario";
import { fechaComercial } from "../utils/fecha-comercial";

// La camioneta elegida vale solo para el dia comercial en que se eligio: cada dia el repartidor vuelve a elegir.
export function camionetaDelDia(usuario: Usuario): string | null {
  return usuario.camionetaActivaId &&
    usuario.camionetaActivaFecha === fechaComercial()
    ? usuario.camionetaActivaId
    : null;
}

export async function bloquearCamioneta(
  id: string,
  transaction: Transaction,
): Promise<Camioneta | null> {
  return Camioneta.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
}

// Devuelve la fila (camioneta, producto) bloqueada, creandola en 0 si todavia no existe.
export async function bloquearStockCamioneta(
  camionetaId: string,
  productoId: string,
  transaction: Transaction,
): Promise<StockCamioneta> {
  const existente = await StockCamioneta.findOne({
    where: { camionetaId, productoId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (existente) return existente;
  return StockCamioneta.create(
    { camionetaId, productoId, cantidad: 0 },
    { transaction },
  );
}
