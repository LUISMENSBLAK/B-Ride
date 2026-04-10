const { getIO } = require('../sockets/index');

class ChatService {
    constructor() {
        // Estructura: rideId -> [ { senderId, message, timestamp, id } ]
        this.chatRooms = new Map();
        
        // Anti-spam tracker: userId -> lastMessageTimestamp
        this.spamLimits = new Map();
    }

    /**
     * @desc Inicializa un bloque de array para el Ride Si no existe. O(1)
     */
    initChat(rideId) {
        if (!this.chatRooms.has(rideId)) {
            this.chatRooms.set(rideId, []);
        }
    }

    /**
     * @desc Agrega mensaje con validaciones crudas y límites.
     */
    addMessage(rideId, senderId, messageRaw) {
        if (!rideId || !senderId || !messageRaw) throw new Error('Payload incompleto');

        // 1. Sanitización básica (Límites de RAM y exploits UI)
        let message = messageRaw.toString().trim();
        if (message.length === 0) throw new Error('Mensaje vacío');
        if (message.length > 300) message = message.substring(0, 300); // Truncar para prevenir flooding buffer

        // 2. Anti-Spam: Limitar a 1 mensaje cada 800ms por usuario
        const now = Date.now();
        const lastMsgTime = this.spamLimits.get(senderId) || 0;
        if (now - lastMsgTime < 800) {
            throw new Error('Estás enviando mensajes muy rápido. Espera un momento.');
        }
        this.spamLimits.set(senderId, now);

        // 3. Persistencia en Memoria (Volátil)
        this.initChat(rideId);
        const history = this.chatRooms.get(rideId);

        // Evitar leaks si el sistema queda encendido por dias: Maximo 200 mensajes por viaje
        if (history.length > 200) {
             history.shift(); // Wipe the oldest one
        }

        const msgObj = {
            id: Math.random().toString(36).substring(2, 9), // Simple UUID pseudo-random
            senderId,
            message,
            timestamp: now
        };

        history.push(msgObj);
        return msgObj;
    }

    /**
     * @desc Devuelve el array de mensajes para repoblar UI de reconectados
     */
    getHistory(rideId) {
        return this.chatRooms.get(rideId) || [];
    }

    /**
     * @desc DESTRUCTIVO: Se invoca al liquidar el Viaje. O(1) GC cleanup.
     */
    cleanupChat(rideId) {
        if (this.chatRooms.has(rideId.toString())) {
             this.chatRooms.delete(rideId.toString());
             try {
                 const io = getIO();
                 io.in(`chat_${rideId}`).socketsLeave(`chat_${rideId}`);
             } catch (e) {
                 // silenciar fallos si import circular
             }
             console.log(`[ChatService] Contexto de chat efímero destruido para Ride ${rideId}`);
        }
    }
}

module.exports = new ChatService();
