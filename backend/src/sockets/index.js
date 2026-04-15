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
            cors: {
                origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
                methods: ['GET', 'POST'],
                credentials: true,
            }
        });


        const admin = require('../config/firebase');
        const User = require('../models/User');

        io.use(async (socket, next) => {
            try {
                // Soportar token en header (extraHeaders) o en auth object
                const authHeader = socket.handshake.headers.authorization;
                const token = (authHeader && authHeader.split(' ')[1]) || socket.handshake.auth?.token;

                if (!token) {
                    return next(new Error('Authentication error: No token provided'));
                }

                const jwt = require('jsonwebtoken');
                let user = null;

                try {
                    // Intentar JWT propio (flujo principal — Firebase desactivado)
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    user = await User.findById(decoded.id).select('isBlocked isBanned lockUntil role');
                } catch (jwtErr) {
                    // Fallback: Firebase ID Token (por si se reactiva en el futuro)
                    try {
                        const admin = require('../config/firebase');
                        const decoded = await admin.auth().verifyIdToken(token);
                        user = await User.findOne({ firebaseUid: decoded.uid }).select('isBlocked isBanned lockUntil role');
                    } catch (fbErr) {
                        return next(new Error('Authentication error: Invalid token'));
                    }
                }

                if (!user) return next(new Error('Authentication error: User not found'));

                if (user.isBlocked || user.isBanned) {
                    return next(new Error('Authentication error: Account is banned'));
                }
                if (user.lockUntil && user.lockUntil > Date.now()) {
                    return next(new Error('Authentication error: Account temporarily locked'));
                }

                socket.userId = user._id.toString();
                socket.userRole = user.role;

                next();
            } catch (err) {
                console.error('[Socket Auth] Unexpected error:', err.message);
                return next(new Error('Authentication error: Unexpected error'));
            }
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
