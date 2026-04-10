require('dotenv').config();
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
app.use(helmet()); // Set security HTTP headers
app.use(cors());

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

app.use(express.json({ limit: '10mb' })); // Limit body payload extended for avatar base64

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io
const io = socketio.init(server);
io.on('connection', (socket) => {
    // Attach ride events to each connection
    rideEvents(socket);
    // Attach chat lifecycle
    chatEvents(socket);
});

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/rides', require('./src/routes/ride.routes'));
app.use('/api/payment', require('./src/routes/payment.routes'));
app.use('/api/drivers', require('./src/routes/driver.routes'));

// Basic Healthcheck Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'API is running' });
});

// CRON JOB: Payment Expiration Cleanup running every 5 minutes
cron.schedule('*/5 * * * *', () => {
    console.log('[System] Corriendo recovery job (Zombies en PROCESSING & Expiraciones)...');
    paymentService.cronRecoveryJobs().catch(e => console.error('[Cron Error]', e.message));
});

const PORT = process.env.PORT || 5000;

const expressServer = server.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

// INIT LOCATION CACHE FLUSH INTERVAL (60 Secs)
const locationCacheModule = require('./src/services/locationCache.service');
const locationInterval = setInterval(() => {
    locationCacheModule.flushToDatabase().catch(e => console.error('[Flush] Err:', e.message));
}, 60000);

// GRACEFUL SHUTDOWN (SIGINT / SIGTERM)
const shutdownHandler = async (signal) => {
    console.log(`\n[System] Recibida señal ${signal}. Iniciando Graceful Shutdown...`);
    clearInterval(locationInterval);
    
    // Fallback Timer en caso de colapso extremo
    const forceExitTimer = setTimeout(() => {
        console.error('[System] Shutdown forzado por Timeout (3s). Saliendo ciegamente.');
        process.exit(1);
    }, 3000);

    try {
        await locationCacheModule.flushToDatabase();
        console.log('[System] Telemetría residual asegurada en MongoDB.');
        
        expressServer.close(() => {
            console.log('[System] Interfaces Express/HTTP cerradas exitosamente.');
            clearTimeout(forceExitTimer);
            process.exit(0);
        });
    } catch (e) {
        console.error('[System] Error Crítico cerrando el sistema:', e.message);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
process.on('SIGINT',  () => shutdownHandler('SIGINT'));
