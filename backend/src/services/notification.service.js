const { Expo } = require('expo-server-sdk');
const { isUserConnected } = require('../sockets/index');
const User = require('../models/User');

// Nuevo cliente Expo
const expo = new Expo();

/**
 * Filtra usuarios conectados (Socket) y envía Push a los demás.
 * @param {Array<{userId: string, title: string, body: string, data: object}>} notifications 
 */
const sendSmartPushNotifications = async (notifications) => {
    const messages = [];

    for (const notif of notifications) {
        // LÓGICA INTELIGENTE: Si está en foreground (socket conectado), NO ENVIAR PUSH.
        if (isUserConnected(notif.userId)) {
            console.log(`[PushService] Usuario ${notif.userId} en foreground. Push omitido.`);
            continue; 
        }

        // Obtener Push Tokens de la BD
        const user = await User.findById(notif.userId).select('+expoPushTokens');
        if (!user || !user.expoPushTokens || user.expoPushTokens.length === 0) {
            console.log(`[PushService] Usuario ${notif.userId} sin tokens válidos. Omitido.`);
            continue;
        }

        for (const token of user.expoPushTokens) {
            if (!Expo.isExpoPushToken(token)) {
                console.error(`[PushService] Token inválido para usuario ${notif.userId}: ${token}`);
                // TODO: Limpiar token inválido usando user.updateOne({$pull: {expoPushTokens: token}})
                continue;
            }

            messages.push({
                to: token,
                sound: 'default',
                title: notif.title,
                body: notif.body,
                data: notif.data,
            });
        }
    }

    if (messages.length === 0) return;

    // Expo recomienda enviar en lotes (chunks)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];

    for (const chunk of chunks) {
        try {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log(`[PushService] Lote enviado. Tickets:`, ticketChunk);
            tickets.push(...ticketChunk);
        } catch (error) {
            console.error('[PushService] Error enviando lote:', error);
        }
    }

    // Opcional: Manejo de errores en tickets (ej. DeviceNotRegistered)
    // Se recomienda implementarlo en un job secundario, pero lo haremos inline básico.
    // getReceipts() sería lo ideal, pero verificar los tickets es un primer filtro:
    let receiptIds = [];
    for (let ticket of tickets) {
        // En un caso real iteraríamos mensajes con tickets para buscar el ID usuario.
        if (ticket.status === 'error') {
            if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
                console.log(`[PushService] DeviceNotRegistered encontrado. Se debería limpiar token.`);
            }
        }
    }
};

module.exports = {
    sendSmartPushNotifications
};
