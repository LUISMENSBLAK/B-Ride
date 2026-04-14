/**
 * N1: Servicio de push notifications para TODOS los eventos críticos.
 * Usa expo-server-sdk para enviar notificaciones push.
 */

const User = require('../models/User');

// Usa expo-server-sdk si está instalado, sino fallback a console
let Expo;
try {
    Expo = require('expo-server-sdk').Expo;
} catch {
    Expo = null;
}

const expo = Expo ? new Expo() : null;

/**
 * Eventos que DEBEN enviar push notification:
 * - RIDE_OFFER_RECEIVED   → conductor recibe solicitud
 * - RIDE_ACCEPTED          → pasajero sabe que fue aceptado
 * - DRIVER_ARRIVED         → conductor llegó al punto
 * - RIDE_CANCELLED         → ambas partes
 * - SOS                    → admins + contacto emergencia
 * - PAYMENT_COMPLETED      → pasajero recibe recibo
 */

const PUSH_TEMPLATES = {
    RIDE_OFFER_RECEIVED: {
        title: '🚗 Nueva solicitud de viaje',
        body: (data) => `Un pasajero solicita viaje a ${data.destination || 'destino'}`,
    },
    RIDE_ACCEPTED: {
        title: '✅ Viaje aceptado',
        body: (data) => `${data.driverName || 'Tu conductor'} aceptó el viaje`,
    },
    DRIVER_ARRIVED: {
        title: '📍 Tu conductor llegó',
        body: () => 'Tu conductor te está esperando en el punto de recogida',
    },
    RIDE_CANCELLED: {
        title: '❌ Viaje cancelado',
        body: (data) => data.reason || 'El viaje ha sido cancelado',
    },
    SOS: {
        title: '🚨 EMERGENCIA SOS',
        body: (data) => `SOS activado por ${data.userName || 'usuario'} en viaje activo`,
    },
    PAYMENT_COMPLETED: {
        title: '💰 Pago completado',
        body: (data) => `Se cobró $${data.amount || '0'} por tu viaje`,
    },
};

class PushNotificationService {

    /**
     * Enviar push a un usuario específico.
     */
    async sendToUser(userId, eventType, data = {}) {
        try {
            const user = await User.findById(userId).select('+expoPushTokens');
            if (!user?.expoPushTokens?.length) {

                return;
            }

            const template = PUSH_TEMPLATES[eventType];
            if (!template) {
                console.warn(`[Push] Template no encontrado para ${eventType}`);
                return;
            }

            const messages = user.expoPushTokens
                .filter(token => !Expo || Expo.isExpoPushToken(token))
                .map(token => ({
                    to: token,
                    sound: 'default',
                    title: template.title,
                    body: template.body(data),
                    data: { eventType, ...data },
                    priority: eventType === 'SOS' ? 'high' : 'default',
                }));

            if (expo && messages.length > 0) {
                const chunks = expo.chunkPushNotifications(messages);
                for (const chunk of chunks) {
                    try {
                        await expo.sendPushNotificationsAsync(chunk);
                    } catch (e) {
                        console.error('[Push] Error enviando chunk:', e.message);
                    }
                }

            } else {

            }
        } catch (e) {
            console.error('[Push] Error:', e.message);
        }
    }

    /**
     * Enviar push a múltiples usuarios.
     */
    async sendToUsers(userIds, eventType, data = {}) {
        await Promise.all(userIds.map(id => this.sendToUser(id, eventType, data)));
    }
}

module.exports = new PushNotificationService();
