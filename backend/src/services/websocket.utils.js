/**
 * RT1-RT3: Servicio de WebSocket mejorado.
 *
 * RT1: Rejoin automático a rooms + recuperación de estado.
 * RT2: Idempotencia en eventos (deduplicación).
 * RT3: Detección de estado de conexión para fallback.
 */

// RT2: Set de event IDs procesados (por socket) para idempotencia
const processedEvents = new Map(); // socketId → Set<eventId>
const MAX_EVENTS_PER_SOCKET = 500;

/**
 * RT2: Genera un ID único para deduplicación de eventos.
 */
function generateEventId(eventName, payload) {
    const key = `${eventName}:${payload?.rideId || ''}:${Date.now()}`;
    return key;
}

/**
 * RT2: Verifica si un evento ya fue procesado (idempotencia).
 */
function isEventProcessed(socketId, eventId) {
    const events = processedEvents.get(socketId);
    if (!events) return false;
    return events.has(eventId);
}

/**
 * RT2: Marca un evento como procesado.
 */
function markEventProcessed(socketId, eventId) {
    if (!processedEvents.has(socketId)) {
        processedEvents.set(socketId, new Set());
    }
    const events = processedEvents.get(socketId);
    events.add(eventId);

    // Limpiar eventos antiguos para evitar memory leak
    if (events.size > MAX_EVENTS_PER_SOCKET) {
        const arr = Array.from(events);
        const toRemove = arr.slice(0, arr.length - MAX_EVENTS_PER_SOCKET / 2);
        toRemove.forEach(id => events.delete(id));
    }
}

/**
 * RT1: Cleanups al desconectar socket.
 */
function cleanupSocket(socketId) {
    processedEvents.delete(socketId);
}

/**
 * RT1: Rejoin a un room de ride tras reconexión.
 */
function rejoinRideRoom(socket, rideId) {
    if (rideId) {
        socket.join(`ride:${rideId}`);

    }
}

/**
 * Emitir evento con idempotencia opcional.
 */
function emitIdempotent(io, room, event, data, eventId) {
    if (eventId) {
        data._eventId = eventId;
    }
    io.to(room).emit(event, data);
}

module.exports = {
    generateEventId,
    isEventProcessed,
    markEventProcessed,
    cleanupSocket,
    rejoinRideRoom,
    emitIdempotent,
};
