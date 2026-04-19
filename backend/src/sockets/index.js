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

// FIX-12: Limpieza periódica de entradas huérfanas en connectedUsers
setInterval(() => {
    for (const [uid, sockets] of connectedUsers.entries()) {
        if (sockets.size === 0) connectedUsers.delete(uid);
    }
}, 60_000);

// ─────────────────────────────────────────────────────────────────────────────────

module.exports = {
    init: (httpServer) => {
        io = require('socket.io')(httpServer, {
            pingInterval: 25000,
            pingTimeout: 20000, // Reduced from 60s to 20s as requested
            upgradeTimeout: 10000,
            maxHttpBufferSize: 1e6,
            cors: {
                origin: process.env.CORS_ORIGIN
                  ? process.env.CORS_ORIGIN.split(',')
                  : (process.env.NODE_ENV === 'production' ? [] : '*'),
                methods: ['GET', 'POST'],
                credentials: true,
            }
        });


        const admin = require('../config/firebase');
        const User = require('../models/User');

        io.use(async (socket, next) => {
            console.log(`[Socket] New connection attempt from IP: ${socket.handshake.address}`);
            try {
                // Soportar token en header (extraHeaders) o en auth object
                const authHeader = socket.handshake.headers.authorization;
                const token = (authHeader && authHeader.split(' ')[1]) || socket.handshake.auth?.token;
                
                if (!token) {
                    return next(new Error('Authentication error: No token provided'));
                }

                let user = null;

                // 1. Intentar verificar como Firebase ID Token
                try {
                    const decodedFirebase = await admin.auth().verifyIdToken(token);
                    user = await User.findOne({ firebaseUid: decodedFirebase.uid }).select('isBlocked isBanned lockUntil role');
                    if (user && process.env.NODE_ENV !== 'production') console.log(`[Socket Auth] Valid Firebase token for user: ${user._id}`);
                } catch (firebaseErr) {
                    // Fallback: tratar de descifrar como backend JWT local (Admin Panel & Legacy)
                    try {
                        const jwt = require('jsonwebtoken');
                        const decodedJwt = jwt.verify(token, process.env.JWT_SECRET);
                        user = await User.findById(decodedJwt.id || decodedJwt.userId).select('isBlocked isBanned lockUntil role');
                        if (user && process.env.NODE_ENV !== 'production') console.log(`[Socket Auth] Valid JWT for user: ${user._id}`);
                    } catch (jwtErr) {
                        if (process.env.NODE_ENV !== 'production') console.error('[Socket Auth] Invalid token error (Firebase & JWT):', jwtErr.message);
                        return next(new Error('Authentication error: Invalid token'));
                    }
                }

                if (!user) {
                    console.error('[Socket Auth] User not found for provided token');
                    return next(new Error('Authentication error: User not found'));
                }

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
