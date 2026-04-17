/**
 * Watchdog Service for Driver Network Tolerance.
 * Monitorea heartbeats de los conductores. Si se pasa del umbral, emite alertas a la room respectiva.
 */

const { getIO } = require('../sockets/index');

class WatchdogService {
    constructor() {
        this.heartbeats = new Map(); // driverId -> { lastSeen: timestamp, rideId: string, status: 'OK' | 'WARNING' }
        this.WARNING_THRESHOLD = 10000; // 10 segundos para Warning
        this.DISCONNECT_THRESHOLD = 25000; // 25 segundos para Disconnect Fatal
        
        this.timer = setInterval(() => this._checkHeartbeats(), 5000);
    }

    /**
     * @param {string} driverId 
     * @param {string} rideId 
     */
    ping(driverId, rideId) {
        if (!driverId) return;
        const dId = driverId.toString();
        
        // Si el driver venía de estar ausente, lo recuperamos
        const record = this.heartbeats.get(dId);
        if (record && record.status !== 'OK') {
             try {
                // Notificar re-conexión al pasajero
                if (rideId) getIO().to(`ride_${rideId}`).emit('driver_recovered', { driverId: dId });
             } catch(e) {}
        }

        this.heartbeats.set(dId, {
            lastSeen: Date.now(),
            rideId: rideId,
            status: 'OK'
        });
    }

    remove(driverId) {
        if (!driverId) return;
        this.heartbeats.delete(driverId.toString());
    }

    _checkHeartbeats() {
        try {
            const io = getIO();
            const now = Date.now();

            for (const [driverId, data] of this.heartbeats.entries()) {
                const diff = now - data.lastSeen;

                if (diff >= this.DISCONNECT_THRESHOLD) {
                    // Fatal disconnect
                    if (data.rideId) {
                        io.to(`ride_${data.rideId}`).emit('driver_disconnected', { 
                            driverId,
                            message: 'El conductor ha perdido conexión gravemente.' 
                        });
                    }
                    this.heartbeats.delete(driverId);
                } 
                else if (diff >= this.WARNING_THRESHOLD && data.status === 'OK') {
                    // Start Warning phase
                    data.status = 'WARNING';
                    this.heartbeats.set(driverId, data);
                    
                    if (data.rideId) {
                        io.to(`ride_${data.rideId}`).emit('driver_warning', { 
                            driverId,
                            message: 'Red inestable del conductor...' 
                        });
                    }
                }
            }
        } catch(e) {
            // Silence IO init errors before it binds
        }
    }

    // FIX-11: método destroy para limpiar el interval y evitar leaks
    destroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.heartbeats.clear();
    }
}

module.exports = new WatchdogService();
