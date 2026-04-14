const Stripe = require('stripe');
const User = require('../models/User');
const Ride = require('../models/Ride');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_b_ride_123');

class PaymentService {

    /**
     * @desc Valida la oferta y el ride, calcula la comisión base db
     */
    async createPaymentIntent(rideId, bidId, passengerId, idempotencyKey, currency = 'USD') {
        const ride = await Ride.findById(rideId);
        if (!ride) throw new Error('Viaje no encontrado');
        
        if (ride.passenger.toString() !== passengerId.toString()) {
            throw new Error('Access denied: Solo el pasajero puede pagar su propio viaje');
        }

        // [HARDENING] Reutilización de Payment Intent Existente
        if (ride.paymentIntentId) {
            try {
                const existingPi = await stripe.paymentIntents.retrieve(ride.paymentIntentId);
                // Si está en estado pendiente de procesamiento/confirmación, se reutiliza
                if (['requires_payment_method', 'requires_confirmation'].includes(existingPi.status)) {

                    return {
                        clientSecret: existingPi.client_secret,
                        paymentIntentId: existingPi.id,
                        amount: existingPi.amount / 100 // Retorna dólares
                    };
                }
            } catch (error) {
                console.warn(`[Payment] Error recuperando Intent previo, creando uno nuevo: ${error.message}`);
                // Avanza y crea uno nuevo bajo tu propio riesgo (idealmente requiere abortar, 
                // pero si no recuperó, continuemos)
            }
        }

        const bid = ride.bids.find(b => b._id.toString() === bidId);
        if (!bid) throw new Error('Bid no encontrado en la base de datos');

        const driver = await User.findById(bid.driver).select('+stripeAccountId');
        if (!driver || !driver.stripeAccountId) {
            throw new Error('El conductor no está habilitado para recibir pagos.');
        }

        const passenger = await User.findById(passengerId).select('+stripeCustomerId');
        
        // Multi-Moneda: Convierte el precio base (USD) a la moneda local de cobro del usuario
        const pricingService = require('./pricing.service');
        const convertedPrice = pricingService.convertAmount(bid.price, currency);

        // 15% Commision calculated safely
        const amountCents = Math.round(convertedPrice * 100);
        const feeCents = Math.round(amountCents * 0.15);

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

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: currency.toLowerCase(),
            customer: customerId,
            capture_method: 'manual',
            transfer_data: { destination: driver.stripeAccountId },
            application_fee_amount: feeCents,
            metadata: {
                rideId: rideId.toString(),
                driverId: driver._id.toString(),
                passengerId: passenger._id.toString()
            }
        }, { idempotencyKey });


        return {
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: bid.price,
            convertedAmount: convertedPrice,
            currency: currency.toUpperCase()
        };
    }

    /**
     * @desc Auto-ejecuta la captura de forma asíncrona pero mediante un LOCK transaccional estricto.
     * Solo opera si el estado es 'HOLD'. Esto previene race conditions en microservicios.
     */
    async executeCapture(rideId, idempotencyKey) {
        // LOCK ATÓMICO: Tratar de pasar de HOLD a PROCESSING
        const ride = await Ride.findOneAndUpdate(
            { _id: rideId, paymentStatus: 'HOLD' },
            { $set: { paymentStatus: 'PROCESSING' } },
            { new: true }
        );

        // Si no pudo bloquear la fila, es por concurrencia o estado inválido
        if (!ride || !ride.paymentIntentId) {

             return;
        }


        try {
            // [HARDENING] Validación Fuerte de Driver en Capture
            const pi = await stripe.paymentIntents.retrieve(ride.paymentIntentId);
            
            if (pi.metadata.rideId !== ride._id.toString()) {
                 throw new Error("Mismatch de metadata: El RideId de DB no empata con Stripe.");
            }
            // Si ride.driver es una ref o un UUID, normalizamos:
            const safeDriverId = ride.driver._id ? ride.driver._id.toString() : ride.driver.toString();
            if (pi.metadata.driverId !== safeDriverId) {
                 throw new Error("Secuestro de transfer: El id del conductor de Stripe no coincide con el receptor activo del viaje en DB.");
            }

            await stripe.paymentIntents.capture(ride.paymentIntentId, {
                idempotencyKey: idempotencyKey || `capture_${ride._id}_${Date.now()}`
            });

            // NOTA: Webhook es el dueño de transicionar a CAPTURED.
        } catch (error) {
            console.error(`[Payment] Error severo en Stripe Capture | Ride: ${rideId} | Error: ${error.message}`);
            // Fallback cauto
            if (error.code !== 'intent_invalid_state') {
                await Ride.updateOne({ _id: rideId }, { $set: { paymentStatus: 'HOLD' } });
            }
        }
    }

    /**
     * @desc Cancela el pago retenido. También usa Lock atómico para prevenir que 
     * se intente cancelar mientras el cron de Capture está operando.
     */
    async executeCancellation(rideId, idempotencyKey) {
        // LOCK ATÓMICO: Tratar de pasar de HOLD a PROCESSING
        const ride = await Ride.findOneAndUpdate(
            { _id: rideId, paymentStatus: 'HOLD' },
            { $set: { paymentStatus: 'PROCESSING' } },
            { new: true }
        );

        if (!ride || !ride.paymentIntentId) {

             return;
        }

        try {
            await stripe.paymentIntents.cancel(ride.paymentIntentId, {
                cancellation_reason: 'requested_by_customer', // O abandoned
                idempotencyKey: idempotencyKey || `cancel_${ride._id}_${Date.now()}`
            });

            // NOTA: De nuevo, Webhook se encargará de poner en CANCELED.
        } catch (error) {
            console.error(`[Payment] Error cancelando pago en Stripe: ${error.message}`);
            if (error.code !== 'intent_invalid_state') {
                await Ride.updateOne({ _id: rideId }, { $set: { paymentStatus: 'HOLD' } });
            }
        }
    }

    /**
     * @desc Refunds seguros con prevención de Over-Refund
     */
    async executeRefund(rideId, amount, reason, idempotencyKey) {
         const ride = await Ride.findOneAndUpdate(
             { _id: rideId, paymentStatus: { $in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
             { $set: { paymentStatus: 'PROCESSING' } },
             { new: true }
         );

         if (!ride || !ride.paymentIntentId) {
              throw new Error('Viaje no califica para reembolso o no está CAPTURED');
         }

         const acceptedBid = ride.bids.find(b => b.status === 'ACCEPTED');
         const maxRefundable = acceptedBid ? acceptedBid.price : 0;
         const remainingRefundable = maxRefundable - (ride.amountRefunded || 0);

         if (amount > remainingRefundable) {
              await Ride.updateOne({ _id: rideId }, { $set: { paymentStatus: ride.paymentStatus === 'PROCESSING' ? 'CAPTURED' : ride.paymentStatus } });
              throw new Error(`Over-refund evadido. Solicitado: $${amount}, Disponible: $${remainingRefundable}`);
         }

         try {
              const amountCents = Math.round(amount * 100);
              const refundParams = {
                  payment_intent: ride.paymentIntentId,
                  amount: amountCents,
                  reason: reason || 'requested_by_customer',
                  metadata: { rideId: ride._id.toString() }
              };
              
              const refund = await stripe.refunds.create(refundParams, {
                  idempotencyKey: idempotencyKey || `refund_${ride._id}_${Date.now()}`
              });


              // Webhook (charge.refunded) será quien asiente el estado final
              return refund;

         } catch (error) {
              // Devolver a estado seguro original
              const revertStatus = ride.amountRefunded > 0 ? 'PARTIALLY_REFUNDED' : 'CAPTURED';
              await Ride.updateOne({ _id: rideId }, { $set: { paymentStatus: revertStatus } });
              throw new Error(`Stripe Refund Fallido: ${error.message}`);
         }
    }

    /**
     * @desc Utilidad para transabilidad forense
     */
    async appendAuditLog(rideId, type, metadata = {}) {
         await Ride.updateOne(
             { _id: rideId },
             { $push: { paymentEvents: { type, metadata, timestamp: new Date() } } }
         );
    }

    /**
     * @desc Reconciliación Manual
     */
    async reconcilePaymentStatus(rideId) {
         const ride = await Ride.findById(rideId);
         if (!ride || !ride.paymentIntentId) throw new Error('Viaje inválido para reconciliación');


         const pi = await stripe.paymentIntents.retrieve(ride.paymentIntentId);
         
         const oldStatus = ride.paymentStatus;
         let newDbStatus = oldStatus;

         if (pi.status === 'succeeded') newDbStatus = 'CAPTURED';
         else if (pi.status === 'requires_capture') newDbStatus = 'HOLD';
         else if (pi.status === 'canceled') newDbStatus = 'CANCELED';
         else if (pi.status === 'requires_payment_method') newDbStatus = 'FAILED';

         if (oldStatus !== newDbStatus) {
             await Ride.updateOne(
                 { _id: rideId },
                 { $set: { paymentStatus: newDbStatus } }
             );

         } else {

         }

         return { rideId, oldStatus, newDbStatus, stripeStatus: pi.status };
    }

    /**
     * @desc CRON SYSTEM (Sencillos). Gestiona Zombie States y Expiraciones Seguras.
     */
    async cronRecoveryJobs() {
        // [HARDENING] ZOMBIES EN PROCESSING (Bloqueados post-failure)
        const zombieDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutos
        const zombies = await Ride.find({
             paymentStatus: 'PROCESSING',
             updatedAt: { $lt: zombieDate }
        });

        if (zombies.length > 0) {

            for (const zombie of zombies) {
                 try {
                     await this.reconcilePaymentStatus(zombie._id);
                 } catch (e) {
                     console.error(`[Payment Zombie Job] Falla resolviendo 🧟 ${zombie._id}:`, e.message);
                 }
            }
        }

        // [HARDENING] EXPIRACIONES REALES (Abandonos sin Captura, >24hrs)
        const expiryDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas
        const expiredRides = await Ride.find({
            paymentStatus: { $in: ['HOLD', 'PENDING'] },
            updatedAt: { $lt: expiryDate }
        });

        if (expiredRides.length > 0) {

             for (const ride of expiredRides) {
                 try {
                     // [HARDENING] Confirmar si se capturó a pesar del limbo DB antes de aniquilar
                     if (ride.paymentIntentId) {
                         const pi = await stripe.paymentIntents.retrieve(ride.paymentIntentId);
                         if (pi.status === 'succeeded') {
                             await this.reconcilePaymentStatus(ride._id); // Actualizar, NO cancelar
                             continue;
                         }
                         await this.executeCancellation(ride._id, `expire_${ride._id}_${Date.now()}`);
                     }
                 } catch (e) {
                     console.error(`[Payment Expiry Job] Falla cancelando expirado ⏰ ${ride._id}:`, e.message);
                 }
             }
        }
    }
}

module.exports = new PaymentService();
