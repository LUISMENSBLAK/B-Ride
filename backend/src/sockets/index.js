let io;

// ─── Mapa de usuarios conectados ─────────────────────────────────────────────
// userId (string) → Set<socketId>
// Permite saber SIN consulta DB si un usuario tiene la app abierta.
// Si está en el mapa → el socket ya le notifica → NO enviamos push (evita duplicados).
const connectedUsers = new Map();

function markUserConnected(userId, socketId) {
    if (!userId) return;
    const uid = userId.toString();
    if (!connectedUsers.has(uid)) connectedUsers.set(uid, new Set());
    connectedUsers.get(uid).add(socketId);
}

function markUserDisconnected(socketId) {
    for (const [uid, sockets] of connectedUsers.entries()) {
        sockets.delete(socketId);
        if (sockets.size === 0) connectedUsers.delete(uid);
    }
}

function isUserConnected(userId) {
    if (!userId) return false;
    const sockets = connectedUsers.get(userId.toString());
    return !!(sockets && sockets.size > 0);
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    init: (httpServer) => {
        io = require('socket.io')(httpServer, {
            cors: { origin: '*', methods: ['GET', 'POST'] }
        });
        return io;
    },
    getIO: () => {
        if (!io) throw new Error('Socket.io not initialized!');
        return io;
    },
    markUserConnected,
    markUserDisconnected,
    isUserConnected,
};
