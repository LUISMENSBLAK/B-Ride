/**
 * B1: Integración con Sentry para monitoreo de errores.
 * Si SENTRY_DSN no está configurado, los métodos son no-ops.
 */

let Sentry;
let isInitialized = false;

function initSentry() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {

        return;
    }

    try {
        Sentry = require('@sentry/node');
        Sentry.init({
            dsn,
            environment: process.env.NODE_ENV || 'development',
            tracesSampleRate: 0.1,  // 10% de transacciones
            beforeSend(event) {
                // No enviar errores en desarrollo
                if (process.env.NODE_ENV === 'development') {
                    return null;
                }
                return event;
            },
        });
        isInitialized = true;

    } catch (e) {
        console.warn('[Sentry] @sentry/node no instalado. Ejecuta: npm install @sentry/node');
    }
}

function captureException(error, context = {}) {
    if (isInitialized && Sentry) {
        Sentry.withScope(scope => {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
            Sentry.captureException(error);
        });
    }
    // Siempre loguear localmente
    console.error('[Error]', error.message || error, context);
}

function captureMessage(message, level = 'info') {
    if (isInitialized && Sentry) {
        Sentry.captureMessage(message, level);
    }

}

function setUser(user) {
    if (isInitialized && Sentry) {
        Sentry.setUser({ id: user._id?.toString(), email: user.email });
    }
}

module.exports = {
    initSentry,
    captureException,
    captureMessage,
    setUser,
};
