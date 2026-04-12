const cron = require('node-cron');
const User = require('../models/User');
const Ride = require('../models/Ride');
const sendEmail = require('../utils/sendEmail');
const locationCacheModule = require('./locationCache.service');
const matchingService = require('./matching.service');
const { getIO } = require('../sockets');

const startMaintenanceCrons = () => {
    console.log('[System] Registrando Cron Jobs de Mantenimiento / Dispatcher...');

    // 1. Account Deletion Routine (Diario a las 3 AM)
    // Elimina usuarios cuya deletionRequested: true e deletionRequestedAt fue hace > 30 días
    cron.schedule('0 3 * * *', async () => {
        try {
            console.log('[Cron] Ejecutando purga de cuentas eliminadas (3 AM)...');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const usersToDelete = await User.find({
                 deletionRequested: true,
                 deletionRequestedAt: { $lte: thirtyDaysAgo }
            });

            for (const u of usersToDelete) {
                 await User.findByIdAndDelete(u._id);
                 console.log(`[Cron] Usuario ${u._id} purgado permanentemente.`);
                 // Notify here if needed
            }
        } catch (e) {
            console.error('[Maintenance Cron 1 Error]', e);
        }
    });

    // 2. Scheduled Rides Dispatcher (Cada 1 Minuto) [Fase 9]
    // Pasa los viajes de SCHEDULED a REQUESTED si faltan <= 15 mins para su scheduledAt
    cron.schedule('* * * * *', async () => {
        try {
            const now = new Date();
            const in15Mins = new Date(now.getTime() + 15 * 60 * 1000);

            const scheduledRides = await Ride.find({
                status: 'SCHEDULED',
                isScheduled: true,
                scheduledAt: { $lte: in15Mins, $gte: new Date(now.getTime() - 60*60*1000) } // Ignorar cosas superviejas
            }).populate('passenger', 'name email phoneNumber');

            for (const ride of scheduledRides) {
                ride.status = 'REQUESTED';
                ride.version = (ride.version || 1) + 1;
                await ride.save();

                console.log(`[Dispatcher] Viaje programado ${ride._id} despachado a la subasta en vivo.`);

                // Disparar Subasta
                matchingService.startMatchingCampaign(ride.toObject(), getIO());
                getIO().to(ride.passenger._id.toString()).emit('rideRequestCreated', ride);
            }
        } catch (e) {
            console.error('[Maintenance Cron 2 Error]', e);
        }
    });

    // 3. Driver Last-Seen Tracker (Cada 1 Hora)
    // Marca como OFFLINE a conductores cujo offline heartbeat tenga > 10 min
    cron.schedule('0 * * * *', async () => {
        try {
             console.log('[Cron] Ejecutando verificación de conductores inactivos...');
             const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
             // Here we use locationCache directly since that's where watchdogs ping
             const offlineUserIds = [];
             for (const [key, val] of locationCacheModule.cache.entries()) {
                  if (val.timestamp < tenMinutesAgo) {
                       offlineUserIds.push(key);
                       locationCacheModule.cache.delete(key);
                  }
             }

             if (offlineUserIds.length > 0) {
                 await User.updateMany({ _id: { $in: offlineUserIds } }, { driverStatus: 'OFFLINE' });
                 console.log(`[Cron] Marcados ${offlineUserIds.length} conductores como OFFLINE por inactividad.`);
             }
        } catch (e) {
            console.error('[Maintenance Cron 3 Error]', e);
        }
    });

    // 4. Suspensión de conductores por Documentos (Diario a las 9:30 AM)
    // Fase 16 específica: Si driverLicense.expiryDate ya venció -> Suspender y Email.
    cron.schedule('30 9 * * *', async () => {
        try {
            console.log('[Cron] Verificando suspensiones de conductores por docs vencidos (9:30 AM)...');
            const today = new Date();
            const suspendedDrivers = await User.find({
                 role: 'DRIVER',
                 driverApprovalStatus: 'APPROVED',
                 'driverLicense.expiryDate': { $lt: today }
            });

            for (const driver of suspendedDrivers) {
                 driver.driverApprovalStatus = 'REJECTED';
                 driver.driverStatus = 'OFFLINE';
                 await driver.save();

                 await sendEmail({
                     email: driver.email,
                     subject: 'Aviso Importante: Cuenta de B-Ride Suspendida',
                     message: `Hola ${driver.name},<br/><br/>Su cuenta de conductor ha sido temporalmente suspendida porque su Licencia de Conducir ha vencido el pasado ${driver.driverLicense?.expiryDate?.toLocaleDateString()}.<br/><br/>Por favor actualice su documentación de inmediato para recuperar el acceso a la plataforma.`
                 });
                 console.log(`[Cron] Conductor ${driver._id} suspendido por licencia vencida.`);
            }
        } catch (e) {
            console.error('[Maintenance Cron 4 Error]', e);
        }
    });
};

module.exports = { startMaintenanceCrons };
