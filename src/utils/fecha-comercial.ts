const formato = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function fechaComercial(fecha = new Date()): string {
    const partes = formato.formatToParts(fecha);
    const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find(parte => parte.type === tipo)!.value;
    return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function diasComercialesDesde(fecha: Date, hoy = new Date()): number {
    return Math.floor((Date.parse(fechaComercial(hoy)) - Date.parse(fechaComercial(fecha))) / 86400000);
}
