/**
 * R1: Máquina de estados estricta para viajes.
 * Impide transiciones inválidas (ej: COMPLETED → IN_PROGRESS).
 * R2: Lock atómico para doble aceptación.
 */

// Transiciones válidas del viaje
const VALID_TRANSITIONS = {
    'REQUESTED':    ['NEGOTIATING', 'CANCELLED'],
    'NEGOTIATING':  ['ACCEPTED', 'CANCELLED'],
    'ACCEPTED':     ['ARRIVED', 'IN_PROGRESS', 'CANCELLED'],
    'ARRIVED':      ['IN_PROGRESS', 'CANCELLED'],
    'IN_PROGRESS':  ['COMPLETED', 'CANCELLED'],
    'COMPLETED':    [],  // Estado terminal
    'CANCELLED':    [],  // Estado terminal
};

/**
 * Valida si una transición de estado es permitida.
 * @returns {boolean}
 */
function isValidTransition(currentStatus, newStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed) return false;
    return allowed.includes(newStatus);
}

/**
 * R2: Transición atómica con findOneAndUpdate + condición de estado.
 * Previene race conditions y doble aceptación.
 */
async function atomicTransition(Ride, rideId, expectedCurrentStatus, newStatus, extraUpdate = {}) {
    const filter = {
        _id: rideId,
        status: expectedCurrentStatus,
    };

    const update = {
        $set: {
            status: newStatus,
            ...extraUpdate,
        }
    };

    const result = await Ride.findOneAndUpdate(filter, update, { new: true })
        .populate('passenger', 'name email phoneNumber avatarUrl')
        .populate('driver', 'name email phoneNumber avatarUrl vehicle avgRating');

    if (!result) {
        throw new Error(`Transición inválida: No se pudo cambiar de ${expectedCurrentStatus} a ${newStatus} (ride ${rideId})`);
    }

    return result;
}

module.exports = {
    VALID_TRANSITIONS,
    isValidTransition,
    atomicTransition,
};
