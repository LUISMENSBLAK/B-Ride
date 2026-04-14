const mongoose = require('mongoose');
const Ride = require('../models/Ride');

class ObservabilityService {
    /**
     * In-memory temporal counters para ventanas cortas (5 min).
     */
    constructor() {
        this.metrics = {
            failed_in_window: 0,
            total_in_window: 0,
            refunds_in_window: 0,
        };

        // Reseteador de ventana cada 5 mins
        setInterval(() => {
            this.evaluateWindowAlerts();
            this.metrics.failed_in_window = 0;
            this.metrics.total_in_window = 0;
            this.metrics.refunds_in_window = 0;
        }, 5 * 60 * 1000);
    }

    /**
     * Logueo Estructurado Financiero
     */
    log(level, action, meta = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            action,
            rideId: meta.rideId || null,
            paymentIntentId: meta.paymentIntentId || null,
            userId: meta.userId || null,
            oldState: meta.oldState || null,
            newState: meta.newState || null,
            origin: meta.origin || 'system',
            eventId: meta.eventId || null,
            message: meta.message || ''
        };

    }

    /**
     * Disparo de Alertas Críticas (Ready for Slack/Datadog)
     */
    alert(type, message, context = {}) {
        const payload = {
            ALERT_TRIGGERED: true,
            type,
            message,
            timestamp: new Date().toISOString(),
            context
        };
        console.error(JSON.stringify(payload));
        // Aquí iría el POST a Slack webhook
    }

    /**
     * Interceptor in-memory de volumen y ratios
     */
    trackEvent(type, amount = 0) {
        this.metrics.total_in_window++;
        if (type === 'FAILED') this.metrics.failed_in_window++;
        if (type === 'REFUNDED') this.metrics.refunds_in_window++;
    }

    evaluateWindowAlerts() {
        // Alerta de Fallos Ratios > 20%
        if (this.metrics.total_in_window > 10) {
            const failRatio = this.metrics.failed_in_window / this.metrics.total_in_window;
            if (failRatio > 0.20) {
                this.alert('HIGH_FAILURE_RATIO', 'Más del 20% de los intentos de pago fallaron en los últimos 5 mins', { ratio: failRatio });
            }
        }
        // Alerta Refunds Anómalos
        if (this.metrics.refunds_in_window > 5) {
            this.alert('HIGH_REFUND_VOLUME', 'Pico anormal de devoluciones (Refunds) repentino', { count: this.metrics.refunds_in_window });
        }
    }

    /**
     * Generador del Health Check Financiero (Métricas agregadas DB y Detección de Anomalías)
     */
    async getFinancialHealth() {
        const stateCounts = await Ride.aggregate([
            { $match: { paymentStatus: { $exists: true } } },
            { $group: { _id: "$paymentStatus", count: { $sum: 1 } } }
        ]);

        const countsMap = stateCounts.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // Detección de Anomalías (Checks Automáticos)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
        const twentyFourHrsAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // 1. Zombies PROCESSING
        const zombiesProcess = await Ride.countDocuments({ paymentStatus: 'PROCESSING', updatedAt: { $lt: fiveMinsAgo } });
        
        // 2. Holds estancados sin actividad (Peligro de abandono)
        const staleHolds = await Ride.countDocuments({ paymentStatus: 'HOLD', updatedAt: { $lt: twentyFourHrsAgo } });

        // 3. Over-Refunds (Lógico)
        // Buscamos si existe algun over-refund saltándose filtros. (Se extrae y revisa en app-level o query compleja).
        // Query asumiendo que ride price esté accesible, pero como 'price' está profundo en array bids:
        // Usaremos cantidad de Partially_Refunded como simple check:
        const parcialRefundsCount = countsMap['PARTIALLY_REFUNDED'] || 0;

        if (zombiesProcess > 5) {
            this.alert('CRITICAL_ZOMBIES', `Existen ${zombiesProcess} pagos bloqueados en TRANSACTION_PROCESSING`);
        }

        return {
            status: (zombiesProcess > 0 || staleHolds > 10) ? 'DEGRADED' : 'HEALTHY',
            metrics: {
                total_payments_created: Object.values(countsMap).reduce((a,b)=>a+b, 0),
                total_captured: countsMap['CAPTURED'] || 0,
                total_failed: countsMap['FAILED'] || 0,
                total_refunded: (countsMap['REFUNDED'] || 0) + parcialRefundsCount,
                total_disputed: (countsMap['DISPUTED'] || 0) + (countsMap['DISPUTE_LOST'] || 0) + (countsMap['DISPUTE_WON'] || 0),
                payments_en_PROCESSING: countsMap['PROCESSING'] || 0,
            },
            anomalies: {
                payments_zombies_detectados: zombiesProcess,
                holds_estancados: staleHolds
            },
            timestamp: new Date()
        };
    }
}

module.exports = new ObservabilityService();
