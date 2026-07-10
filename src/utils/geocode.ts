interface ResultadoGeocode {
  latitud: number;
  longitud: number;
}

const BOUNDING_BOX_JUJUY = {
  minLon: -65.45,
  minLat: -24.35,
  maxLon: -65.10,
  maxLat: -24.05,
};
export async function geocodificarDireccion(
  direccion: string,
  localidad?: string | null
): Promise<ResultadoGeocode | null> {
  try {
    const localidadFinal = localidad || 'San Salvador de Jujuy';
    const consulta = [direccion, localidadFinal, 'Jujuy', 'Argentina'].filter(Boolean).join(', ');


    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      q: consulta,
      countrycodes: 'ar', 
      viewbox: `${BOUNDING_BOX_JUJUY.minLon},${BOUNDING_BOX_JUJUY.minLat},${BOUNDING_BOX_JUJUY.maxLon},${BOUNDING_BOX_JUJUY.maxLat}`,
      bounded: '1', 
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const respuesta = await fetch(url, {
      headers: {
        'User-Agent': 'SoderiaApp/1.0 (uso interno)',
      },
    });

    if (!respuesta.ok) return null;

    const datos = await respuesta.json();
    if (!datos || datos.length === 0) return null;

    return {
      latitud: parseFloat(datos[0].lat),
      longitud: parseFloat(datos[0].lon),
    };
  } catch (error) {
    console.error('Error al geocodificar:', error);
    return null;
  }
}