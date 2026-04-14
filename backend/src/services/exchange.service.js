const NodeCache = require('node-cache');
const fetch = require('node-fetch');

class ExchangeService {
    constructor() {
        // Cache con expiración de 12 horas para evadir Rate Limits de APIs gratuitas
        this.cache = new NodeCache({ stdTTL: 43200, checkperiod: 3600 });
        this.baseURl = 'https://api.exchangerate-api.com/v4/latest/USD';
    }

    async getRates() {
        // Retornar si está en caché
        const cachedRates = this.cache.get('RATES');
        if (cachedRates) {
            return cachedRates;
        }

        try {
            // Intento de llamar API gratuita para USD base
            const response = await fetch(this.baseURl);
            if (!response.ok) throw new Error('Network response non-ok');
            
            const data = await response.json();
            if (data && data.rates) {
                // Sobrescribir rate fallback con la API real
                const rates = {
                    USD: 1.0,
                    MXN: data.rates.MXN || parseFloat(process.env.RATE_MXN) || 17.5,
                    EUR: data.rates.EUR || parseFloat(process.env.RATE_EUR) || 0.92,
                };
                this.cache.set('RATES', rates);
                return rates;
            }
        } catch (error) {
            console.error('[ExchangeService] Error obteniendo rates en vivo, usando fallback:', error.message);
        }

        // Fallback robusto en caso de caída de internet o tasa
        const fallbackRates = {
            USD: 1.0,
            MXN: parseFloat(process.env.RATE_MXN) || 17.5,
            EUR: parseFloat(process.env.RATE_EUR) || 0.92,
        };
        this.cache.set('RATES', fallbackRates); // Cacheamos el fallback de todas formas para no ciclar llamadas caídas
        return fallbackRates;
    }

    async convertAmount(amountInUsd, targetCurrency = 'USD') {
        const rates = await this.getRates();
        const rate = rates[targetCurrency.toUpperCase()] || 1.0;
        return amountInUsd * rate;
    }
}

module.exports = new ExchangeService();
