/**
 * Servicio de Idempotencia Abstracto.
 * Diseñado para ser un Cache LRU en Memoria distribuida (Mapeable a Redis en Prod).
 * Guarda 'eventIds' para evitar race-conditions de re-intentos de cliente.
 */

class IdempotencyService {
    constructor() {
        this.cache = new Map();
        this.TTL = 60000; // 60 segundos es suficiente por transaccion
    }

    /**
     * @param {string} eventId
     * @returns {Promise<boolean>} Devuelve true si el evento YA existe (duplicado)
     */
    async isDuplicate(eventId) {
        if (!eventId) return false;
        
        // Simulación de latencia Redis
        return new Promise((resolve) => {
           setImmediate(() => {
               const exists = this.cache.has(eventId);
               if (exists) {
                   const timestamp = this.cache.get(eventId);
                   if (Date.now() - timestamp > this.TTL) {
                       this.cache.delete(eventId);
                       this.cache.set(eventId, Date.now());
                       resolve(false); 
                   } else {
                       resolve(true);
                   }
               } else {
                   this.cache.set(eventId, Date.now());
                   resolve(false);
               }
           });
        });
    }

    /**
     * Realiza un clear (solo para tests)
     */
    async clear() {
        this.cache.clear();
    }
}

module.exports = new IdempotencyService();
