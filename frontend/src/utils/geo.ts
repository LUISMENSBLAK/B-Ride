/**
 * geo.ts — Utilidades de geolocalización compartidas
 * Evita duplicación de haversineKm en múltiples pantallas.
 */

/**
 * Distancia Haversine entre dos puntos (resultado en km).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * ETA en minutos basado en velocidad media urbana.
 */
export function etaMinutes(distKm: number, speedKmh = 30): number {
  return Math.max(1, Math.round((distKm / speedKmh) * 60));
}

/**
 * Geohash encode (precisión 5 ≈ ~5km celda) para comparar celdas en frontend.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohashEncode(latitude: number, longitude: number, precision = 5): string {
  let isEven = true;
  const lat = [-90.0, 90.0];
  const lon = [-180.0, 180.0];
  let bit = 0;
  let ch = 0;
  let geohash = '';

  while (geohash.length < precision) {
    let mid: number;
    if (isEven) {
      mid = (lon[0] + lon[1]) / 2;
      if (longitude > mid) {
        ch |= 1 << (4 - bit);
        lon[0] = mid;
      } else {
        lon[1] = mid;
      }
    } else {
      mid = (lat[0] + lat[1]) / 2;
      if (latitude > mid) {
        ch |= 1 << (4 - bit);
        lat[0] = mid;
      } else {
        lat[1] = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}
