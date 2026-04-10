const { getIO } = require('./index');
const chatService = require('../services/chat.service');

const chatEvents = (socket) => {

    // 1. Join isolated chat_room
    socket.on('join_chat', (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId, userId } = payload;
            if (!rideId || !userId) throw new Error('Datos de ingreso incompletos');

            const roomName = `chat_${rideId}`;
            socket.join(roomName);

            // Re-hidratar historial al cliente (Recuperacion de conexión)
            const history = chatService.getHistory(rideId);
            socket.emit('chat_history', { rideId, messages: history });

            console.log(`[Chat] User ${userId} conectó a ${roomName}`);
            if (isAckRequired) ack({ success: true, history_count: history.length });
        } catch (error) {
            if (isAckRequired) ack({ success: false, error: error.message });
        }
    });

    // 2. Transmisión O(1) interna por room
    socket.on('send_message', (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId, senderId, message } = payload;
            
            // Lógica Central de RAM (Filtra, limita, trunca y guarda)
            const sanitizedMsg = chatService.addMessage(rideId, senderId, message);

            const roomName = `chat_${rideId}`;
            // Emitir A TODOS en esa room (Incluyendo al que lo envió para confirmación UI)
            getIO().to(roomName).emit('receive_message', sanitizedMsg);
            
            if (isAckRequired) ack({ success: true, message: sanitizedMsg });
        } catch (error) {
             // Anti-Spam reject u oros Errores
            if (isAckRequired) ack({ success: false, error: error.message });
            socket.emit('chat_error', { message: error.message });
        }
    });

    // 3. Destrucción o Deserción visual
    socket.on('leave_chat', (payload, ack) => {
        let isAckRequired = typeof ack === 'function';
        try {
            const { rideId } = payload;
            if (rideId) {
                socket.leave(`chat_${rideId}`);
            }
            if (isAckRequired) ack({ success: true });
        } catch (e) {
            if (isAckRequired) ack({ success: false });
        }
    });

};

module.exports = chatEvents;
