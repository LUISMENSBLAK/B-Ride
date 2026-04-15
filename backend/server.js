require('dotenv').config();

// LAUNCH 6: Validar env vars antes de hacer cualquier otra cosa
const validateEnv = require('./src/config/validateEnv');
validateEnv();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const cron = require('node-cron');
const paymentService = require('./src/services/payment.service');

// Connect to MongoDB
connectDB();

const http = require('http');
const socketio = require('./src/sockets');
const rideEvents = require('./src/sockets/ride.events');
const chatEvents = require('./src/sockets/chat.events');

const app = express();

// Security Middlewares
app.use(helmet());

// LAUNCH 4 FIX: CORS restringido por variable de entorno
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
    origin: corsOrigin ? corsOrigin.split(',').map(o => o.trim()) : '*',
    credentials: true,
}));

// Webhook strictly requires raw body for Stripe signature
const paymentWebhookRoute = require('./src/routes/payment.webhook.routes');
app.use('/api/payment/webhook', paymentWebhookRoute);

const path = require('path');
const fs = require('fs');

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.use(express.json({ limit: '10mb' }));

// Rate limiting — 300 reqs / 15min global
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 300 : 50000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiadas solicitudes, intenta más tarde.' },
});
app.use('/api/', limiter);

// Auth routes stricter limit — 20 attempts / 15min
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 20 : 10000, // Elevado en dev para evitar lockouts
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Demasiados intentos de autenticación, intenta más tarde.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketio.init(server);
io.on('connection', (socket) => {
    rideEvents(socket);
    chatEvents(socket);
});

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/rides', require('./src/routes/ride.routes'));
app.use('/api/payment', require('./src/routes/payment.routes'));
app.use('/api/drivers', require('./src/routes/driver.routes'));
// A1: Admin routes
// A1: Admin routes
app.use('/api/admin', require('./src/routes/admin.routes'));
// S5 + O1: Reports/support routes
app.use('/api/reports', require('./src/routes/report.routes'));
// SOS routes
app.use('/api/sos', require('./src/routes/sos.routes'));
// Promos
app.use('/api/promos', require('./src/routes/promo.routes'));
// Wallet
app.use('/api/wallet', require('./src/routes/wallet.routes'));

// Basic Healthcheck Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'API is running', timestamp: new Date().toISOString() });
});

// CRON JOB: Payment Expiration Cleanup
cron.schedule('*/5 * * * *', () => {
    console.log('[System] Corriendo recovery job...');
    paymentService.cronRecoveryJobs().catch(e => console.error('[Cron Error]', e.message));
});

// A6: Document Expiry
require('./src/services/documentExpiry.service').startDocumentExpiryCron();

// M1: Maintenance & Dispatcher Service
require('./src/services/maintenance.service').startMaintenanceCrons();

const PORT = process.env.PORT || 5000;

const expressServer = server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

// INIT LOCATION CACHE FLUSH INTERVAL (60 Secs)
const locationCacheModule = require('./src/services/locationCache.service');
const locationInterval = setInterval(() => {
    locationCacheModule.flushToDatabase().catch(e => console.error('[Flush] Err:', e.message));
}, 60000);

// GRACEFUL SHUTDOWN
const shutdownHandler = async (signal) => {
    console.log(`\n[System] Recibida señal ${signal}. Iniciando Graceful Shutdown...`);
    clearInterval(locationInterval);
    
    const forceExitTimer = setTimeout(() => {
        console.error('[System] Shutdown forzado. Saliendo.');
        process.exit(1);
    }, 3000);

    try {
        await locationCacheModule.flushToDatabase();
        console.log('[System] Telemetría residual asegurada en MongoDB.');
        
        expressServer.close(() => {
            console.log('[System] Interfaces Express/HTTP cerradas.');
            clearTimeout(forceExitTimer);
            process.exit(0);
        });
    } catch (e) {
        console.error('[System] Error Crítico cerrando:', e.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
process.on('SIGINT',  () => shutdownHandler('SIGINT'));
