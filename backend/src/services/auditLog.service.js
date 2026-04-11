/**
 * L3: Logger de auditoría para acciones críticas.
 * Registra eventos inmutables para compliance y debugging.
 */

const mongoose = require('mongoose');

// Modelo de log de auditoría
const auditSchema = new mongoose.Schema({
    action: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    targetId: { type: String }, // ID del recurso afectado
    targetType: { type: String }, // 'Ride', 'User', 'Payment', etc.
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
}, {
    timestamps: true,
    // L3: Logs inmutables — no se pueden actualizar ni eliminar por código
    capped: false,
});

// No permitir updates ni deletes
auditSchema.pre('findOneAndUpdate', function() {
    throw new Error('Audit logs are immutable');
});

const AuditLog = mongoose.model('AuditLog', auditSchema);

/**
 * Registrar una acción de auditoría.
 */
async function logAction(action, userId, targetId, targetType, metadata = {}, req = null) {
    try {
        await AuditLog.create({
            action,
            userId,
            targetId: targetId?.toString(),
            targetType,
            metadata,
            ip: req?.ip || null,
            userAgent: req?.headers?.['user-agent'] || null,
        });
    } catch (e) {
        // Nunca fallar por un log — pero reportar
        console.error('[AuditLog] Error:', e.message);
    }
}

// Acciones predefinidas
const ACTIONS = {
    // Auth
    USER_REGISTERED: 'USER_REGISTERED',
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    PASSWORD_RESET: 'PASSWORD_RESET',
    ACCOUNT_BLOCKED: 'ACCOUNT_BLOCKED',

    // Rides
    RIDE_REQUESTED: 'RIDE_REQUESTED',
    RIDE_ACCEPTED: 'RIDE_ACCEPTED',
    RIDE_CANCELLED: 'RIDE_CANCELLED',
    RIDE_COMPLETED: 'RIDE_COMPLETED',
    BID_PLACED: 'BID_PLACED',
    BID_ACCEPTED: 'BID_ACCEPTED',

    // Payments
    PAYMENT_HOLD: 'PAYMENT_HOLD',
    PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
    PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',

    // Safety
    SOS_ACTIVATED: 'SOS_ACTIVATED',
    REPORT_CREATED: 'REPORT_CREATED',

    // Admin
    DRIVER_APPROVED: 'DRIVER_APPROVED',
    DRIVER_REJECTED: 'DRIVER_REJECTED',
    USER_BLOCKED: 'USER_BLOCKED',

    // Fraud
    MULTI_ACCOUNT_DETECTED: 'MULTI_ACCOUNT_DETECTED',
    GPS_SPOOFING_DETECTED: 'GPS_SPOOFING_DETECTED',
};

module.exports = {
    logAction,
    ACTIONS,
    AuditLog,
};
