const Stripe = require('stripe');
const User = require('../models/User');

// LAUNCH 5 FIX: Sin fallback a clave mock — falla si no hay env var
if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('[Stripe] STRIPE_SECRET_KEY es obligatoria. Configura tu .env');
}
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

class StripeService {
    
    /**
     * Paso 1: Onboarding del Conductor (Crear cuenta Express conectada)
     */
    async createConnectedAccount(user) {
        if (user.stripeAccountId) {
            // Ya tiene cuenta conectada, solo devolvemos link de login
            const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);
            return loginLink.url;
        }

        const account = await stripe.accounts.create({
            type: 'express',
            country: 'US', // O tu país de operación
            email: user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });

        // Guardamos el ID en DB
        user.stripeAccountId = account.id;
        await user.save();

        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: 'http://localhost:8081/driver/onboarding/refresh',
            return_url: 'http://localhost:8081/driver/onboarding/return',
            type: 'account_onboarding',
        });

        return accountLink.url;
    }

    /**
     * Revisa si el onboarding fue exitoso
     */
    async verifyOnboarding(userId) {
        const user = await User.findById(userId).select('+stripeAccountId');
        if (!user.stripeAccountId) throw new Error('No stripe account found');

        const account = await stripe.accounts.retrieve(user.stripeAccountId);
        if (account.details_submitted && account.charges_enabled) {
            user.onboardingComplete = true;
            await user.save();
            return true;
        }
        return false;
    }

    /**
     * Paso 2: Crear el Hold (Payment Intent Manual Capture)
     * Realizado por el pasajero al aceptar el viaje.
     */
    async createHoldIntent({ rideId, passenger, driver, amount, idempotencyKey }) {
        if (!driver.stripeAccountId) {
            throw new Error('El conductor no ha configurado sus cobros en Stripe.');
        }

        // 1. Cálculos de comisión (15% platform fee)
        const amountCents = Math.round(amount * 100);
        const feeCents = Math.round(amountCents * 0.15);

        // 2. Setup Cliente (Passenger) para retener sus tarjetas
        let customerId = passenger.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: passenger.email,
                name: passenger.name
            }, { idempotencyKey: `cust_${passenger._id}` });
            customerId = customer.id;
            passenger.stripeCustomerId = customerId;
            await passenger.save();
        }

        // 3. Crear el Intent de captura manual (Hold) a nombre de la App con transferencia directa.
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'usd',
            customer: customerId,
            capture_method: 'manual', // Obligatorio para retener sin cobrar
            transfer_data: {
                destination: driver.stripeAccountId,
            },
            application_fee_amount: feeCents,
            metadata: {
                rideId: rideId.toString(),
                driverId: driver._id.toString(),
                passengerId: passenger._id.toString()
            }
        }, { idempotencyKey });

        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        };
    }

    /**
     * Paso 3: Captura Final (Se cobra en firme)
     * Invocado cuando el viaje pasa a 'COMPLETED'
     */
    async capturePayment(paymentIntentId, idempotencyKey) {
        if (!paymentIntentId) throw new Error('No hay payment intent asociado.');

        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            
            // Validar protección contra doble capture (Evitar error de stripe)
            if (pi.status === 'succeeded') {
                 console.log('[Stripe] Pago ya fue capturado previamente o vía dashboard.');
                 return pi; 
            }
            if (pi.status === 'canceled') {
                 throw new Error('El pago fue cancelado anteriormente');
            }

            const capturedIntent = await stripe.paymentIntents.capture(paymentIntentId, {
                idempotencyKey
            });
            return capturedIntent;
        } catch (error) {
            console.error('[Stripe] Error Capturando Hold:', error.message);
            throw error;
        }
    }

    /**
     * Paso 4: Cancelar un Hold (Liberar dinero)
     * Invocado si el viaje se cancela.
     */
    async cancelHold(paymentIntentId, idempotencyKey) {
        if (!paymentIntentId) return null;

        try {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
            if (pi.status === 'requires_capture') {
                const canceledIntent = await stripe.paymentIntents.cancel(paymentIntentId, {
                    idempotencyKey
                });
                return canceledIntent;
            }
            return null;
        } catch (error) {
            console.error('[Stripe] Error Cancelando Hold:', error.message);
            return null;
        }
    }
}

module.exports = new StripeService();
