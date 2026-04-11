/**
 * P2: Lógica de tarifa de cancelación.
 * Se cobra una tarifa si el pasajero cancela después de que el conductor
 * ha sido asignado y han pasado más de X minutos.
 */

const CANCELLATION_WINDOW_MS = 2 * 60 * 1000; // 2 minutos sin cargo
const CANCELLATION_FEE_PERCENTAGE = 0.15; // 15% del precio acordado
const MIN_CANCELLATION_FEE = 2.00; // mínimo $2

/**
 * Calcula la tarifa de cancelación basada en el precio del viaje y tiempo transcurrido.
 */
function calculateCancellationFee(ride) {
    if (!ride || !ride.acceptedAt) return 0;

    const timeSinceAccepted = Date.now() - new Date(ride.acceptedAt).getTime();

    // Sin cargo si cancela dentro de la ventana
    if (timeSinceAccepted < CANCELLATION_WINDOW_MS) return 0;

    // Encontrar el precio acordado
    const acceptedBid = ride.bids?.find(b => b.status === 'ACCEPTED');
    const price = acceptedBid?.price || ride.proposedPrice || 0;

    const fee = Math.max(MIN_CANCELLATION_FEE, price * CANCELLATION_FEE_PERCENTAGE);
    return Number(fee.toFixed(2));
}

/**
 * Determina si una cancelación debería cobrar tarifa.
 */
function shouldChargeCancellation(ride, cancelledBy) {
    // No cobrar si el conductor cancela
    if (cancelledBy === ride.driver?.toString()) return false;

    // No cobrar en estados tempranos
    if (['REQUESTED', 'NEGOTIATING'].includes(ride.status)) return false;

    return calculateCancellationFee(ride) > 0;
}

module.exports = {
    calculateCancellationFee,
    shouldChargeCancellation,
    CANCELLATION_WINDOW_MS,
    CANCELLATION_FEE_PERCENTAGE,
    MIN_CANCELLATION_FEE,
};
