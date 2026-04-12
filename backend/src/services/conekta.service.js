const conekta = require('conekta');
// The library API configuration needs to be set up:
conekta.api_key = process.env.CONEKTA_API_KEY || 'key_dummy'; // Add CONEKTA_API_KEY to env
conekta.locale = 'es';

class ConektaService {
    /**
     * Genera un cargo en OXXO (Cash)
     * @param {number} amount MXN, in standard units (will multiply by 100)
     */
    async createOxxoCharge(amount, description, customerInfo, referenceId) {
        return new Promise((resolve, reject) => {
            const chargePayload = {
                "currency": "MXN",
                "amount": Math.round(amount * 100), // Conekta expects cents
                "description": description,
                "reference_id": referenceId,
                "cash": {
                    "type": "oxxo"
                },
                "customer_info": {
                    "name": customerInfo.name,
                    "email": customerInfo.email,
                    "phone": customerInfo.phone || '+525555555555'
                }
            };

            conekta.Order.create({
                currency: 'MXN',
                customer_info: chargePayload.customer_info,
                line_items: [{
                    name: description,
                    unit_price: chargePayload.amount,
                    quantity: 1
                }],
                charges: [{
                    payment_method: { type: 'oxxo_cash' }
                }],
                metadata: { referenceId }
            }, (err, order) => {
                if (err) return reject(err);
                resolve(order.toObject());
            });
        });
    }

    /**
     * Genera un cargo por SPEI
     */
    async createSpeiCharge(amount, description, customerInfo, referenceId) {
        return new Promise((resolve, reject) => {
            conekta.Order.create({
                currency: 'MXN',
                customer_info: {
                    name: customerInfo.name,
                    email: customerInfo.email,
                    phone: customerInfo.phone || '+525555555555'
                },
                line_items: [{
                    name: description,
                    unit_price: Math.round(amount * 100),
                    quantity: 1
                }],
                charges: [{
                    payment_method: { type: 'spei' }
                }],
                metadata: { referenceId }
            }, (err, order) => {
                if (err) return reject(err);
                resolve(order.toObject());
            });
        });
    }
}

module.exports = new ConektaService();
