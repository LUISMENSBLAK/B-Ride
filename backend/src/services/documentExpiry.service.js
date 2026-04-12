const cron = require('node-cron');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

const startDocumentExpiryCron = () => {
    // Runs every day at 09:00 AM
    cron.schedule('0 9 * * *', async () => {
        console.log('[Cron] Ejecutando rutina de expiración de documentos (9 AM)...');
        try {
            const today = new Date();
            const in30Days = new Date();
            in30Days.setDate(today.getDate() + 30);

            const drivers = await User.find({
                role: 'DRIVER',
                $or: [
                    { 'driverLicense.expiryDate': { $lte: in30Days } },
                    { 'vehicle.insuranceExpiryDate': { $lte: in30Days } }
                ]
            });

            for (const driver of drivers) {
                const expiredDocs = [];
                const expiringSoon = [];

                const dlExpiry = driver.driverLicense?.expiryDate;
                if (dlExpiry) {
                    if (dlExpiry < today) expiredDocs.push('Licencia de conducir');
                    else if (dlExpiry <= in30Days) expiringSoon.push(`Licencia de conducir (${dlExpiry.toLocaleDateString()})`);
                }

                // Note: The schema might vary between version 1 and 2, but we'll try to find both insurance or registration logic 
                const vehExpiry = driver.vehicle?.insuranceExpiryDate;
                if (vehExpiry) {
                     if (vehExpiry < today) expiredDocs.push('Seguro de vehículo');
                     else if (vehExpiry <= in30Days) expiringSoon.push(`Seguro de vehículo (${vehExpiry.toLocaleDateString()})`);
                }

                if (expiredDocs.length > 0 || expiringSoon.length > 0) {
                    let message = `Hola ${driver.name}, te escribimos de B-Ride porque se requiere que actualices tu documentación para poder seguir viajando con nosotros.<br/><br/>`;
                    
                    if (expiredDocs.length > 0) {
                        message += `<strong>Documentos Vencidos:</strong><br/>- ${expiredDocs.join('<br>- ')}<br/><br/>`;
                    }
                    if (expiringSoon.length > 0) {
                        message += `<strong>Documentos Próximos a Vencer (30 días o menos):</strong><br/>- ${expiringSoon.join('<br>- ')}<br/><br/>`;
                    }
                    message += `Por favor envíanos la documentación actualizada lo antes posible a través de la aplicación.`;

                    await sendEmail({
                        email: driver.email,
                        subject: 'Acción Requerida: Documentación de Conductor B-Ride',
                        message
                    });
                }
            }
        } catch (error) {
            console.error('[Document Expiry Cron] Error:', error);
        }
    });
};

module.exports = { startDocumentExpiryCron };
