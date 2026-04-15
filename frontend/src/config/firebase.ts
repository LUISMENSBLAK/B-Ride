/**
 * Firebase — DESACTIVADO
 *
 * Firebase ha sido desactivado en B-Ride.
 * La autenticación se maneja mediante JWT propio (jsonwebtoken).
 * Este archivo exporta un placeholder para evitar crashes en imports legacy.
 *
 * NO importar ni usar auth() desde aquí. Usar AsyncStorage + JWT directamente.
 */

// Placeholder — no-op export para compatibilidad con imports legacy
export const auth = () => ({
  currentUser: null,
  signOut: async () => {},
});

export default { auth };
