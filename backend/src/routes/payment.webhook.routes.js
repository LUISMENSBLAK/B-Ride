const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const Ride = require('../models/Ride');
const User = require('../models/User');
const paymentService = require('../services/payment.service');
const obs = require('../services/observability.service');

// Debe ser parseado como un Buffer crudo para que Stripe pueda verificar las firmas.
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error(`[Webhook] Error validando firma Stripe: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Regla: Webhooks como fuente de verdad
    try {
        if (event.type === 'payment_intent.amount_capturable_updated') {
            // El manual capture hold fue exitoso
            const paymentIntent = event.data.object;
            const rideId = paymentIntent.metadata.rideId;
            
            const result = await Ride.updateOne(
                { _id: rideId, paymentStatus: { $nin: ['CAPTURED', 'CANCELED'] } },
                { $set: { paymentStatus: 'HOLD', paymentIntentId: paymentIntent.id } }
            );
            if (result.modifiedCount > 0) {
                 obs.log('INFO', 'HOLD_APPLIED', { rideId, paymentIntentId: paymentIntent.id, newState: 'HOLD' });
            } else {
                 obs.log('WARN', 'HOLD_IGNORED_TARDIO', { rideId });
            }
            
        } else if (event.type === 'payment_intent.succeeded') {
            // Captura final exitosa (Siempre puede sobreescribir porque CAPTURED es final definitivo)
            const paymentIntent = event.data.object;
            const rideId = paymentIntent.metadata.rideId;

            await Ride.updateOne(
                { _id: rideId, paymentStatus: { $ne: 'CANCELED' } },
                { $set: { paymentStatus: 'CAPTURED', paymentIntentId: paymentIntent.id } }
            );
            obs.log('INFO', 'PAYMENT_CAPTURED', { rideId, paymentIntentId: paymentIntent.id, newState: 'CAPTURED' });
            obs.trackEvent('CAPTURED');
            
        } else if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
            // Fallo en pago o cancelación
            const paymentIntent = event.data.object;
            const rideId = paymentIntent.metadata.rideId;
            const isCanceled = event.type === 'payment_intent.canceled';
            const targetStatus = isCanceled ? 'CANCELED' : 'FAILED';

            // No sobreescribir un CAPTURED con un CANCELED retrasado
            const result = await Ride.updateOne(
                { _id: rideId, paymentStatus: { $ne: 'CAPTURED' } },
                { $set: { paymentStatus: targetStatus, paymentIntentId: paymentIntent.id } }
            );
            
            if (result.modifiedCount > 0) {
                obs.log('INFO', 'PAYMENT_FAILED_OR_CANCELED', { rideId, newState: targetStatus, paymentIntentId: paymentIntent.id });
                obs.trackEvent('FAILED');
                await paymentService.appendAuditLog(rideId, targetStatus, { intentId: paymentIntent.id });

                if (!isCanceled) {
                     // Lógica Antifraude Básica
                     const ride = await Ride.findById(rideId);
                     if (ride) {
                          const passenger = await User.findById(ride.passenger);
                          if (passenger) {
                               passenger.failedPaymentCount += 1;
                               if (passenger.failedPaymentCount >= 3) {
                                    passenger.isFlagged = true;
                                    obs.alert('USER_FLAGGED_FRAUD', `Usuario ${passenger._id} tiene 3 fail payments`, { userId: passenger._id });
                               }
                               await passenger.save();
                          }
                     }
                }
            } else {
                obs.log('INFO', 'CANCELED_FAILED_IGNORED_TARDIO', { rideId });
            }
        } else if (event.type === 'charge.refunded') {
             const charge = event.data.object;
             const paymentIntentId = charge.payment_intent;
             const ride = await Ride.findOne({ paymentIntentId });
             
             if (ride) {
                  const amountRefunded = charge.amount_refunded / 100;
                  const acceptedBid = ride.bids.find(b => b.status === 'ACCEPTED');
                  const targetStatus = (acceptedBid && amountRefunded >= acceptedBid.price) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

                  await Ride.updateOne(
                      { _id: ride._id },
                      { 
                          $set: { paymentStatus: targetStatus, amountRefunded, stripeRefundId: charge.refunds?.data[0]?.id },
                      }
                  );
                  await paymentService.appendAuditLog(ride._id, 'REFUND', { amount: amountRefunded, refundId: charge.refunds?.data[0]?.id });
                  obs.log('INFO', 'REFUND_APPLIED', { rideId: ride._id, newState: targetStatus, amountRefunded });
                  obs.trackEvent('REFUNDED', amountRefunded);
             }
        } else if (event.type === 'charge.dispute.created') {
             const dispute = event.data.object; // dispute entity
             const paymentIntentId = dispute.payment_intent;
             const ride = await Ride.findOne({ paymentIntentId });
             if (ride) {
                  await Ride.updateOne({ _id: ride._id }, { $set: { paymentStatus: 'DISPUTED' } });
                  await paymentService.appendAuditLog(ride._id, 'DISPUTE', { disputeId: dispute.id, reason: dispute.reason });
                  
                  obs.alert('CRITICAL_DISPUTE_OPENED', `Disputa abierta Ride ${ride._id}`, { disputeId: dispute.id, reason: dispute.reason });
                  obs.trackEvent('DISPUTE');
                  
                  await User.updateOne({ _id: ride.passenger }, { $set: { isFlagged: true } });
             }
        } else if (event.type === 'charge.dispute.closed') {
             const dispute = event.data.object;
             const paymentIntentId = dispute.payment_intent;
             const ride = await Ride.findOne({ paymentIntentId });
             if (ride) {
                  const won = dispute.status === 'won';
                  const nextState = won ? 'DISPUTE_WON' : 'DISPUTE_LOST';
                  await Ride.updateOne({ _id: ride._id }, { $set: { paymentStatus: nextState } });
                  await paymentService.appendAuditLog(ride._id, nextState, { disputeId: dispute.id, status: dispute.status });
                  obs.log('INFO', 'DISPUTE_CLOSED', { rideId: ride._id, newState: nextState });
             }
        }

        // Return a successful response so Stripe doesn't retry
        res.json({ received: true });
    } catch (e) {
        obs.log('ERROR', 'WEBHOOK_INTERNAL_FAIL', { message: e.message });
        res.status(500).json({ error: 'Internal fail' });
    }
});

// Conekta Webhook
router.post('/conekta', express.json(), async (req, res) => {
    try {
         const event = req.body;

         if (event.type === 'order.paid') {
              const order = event.data.object;
              const referenceId = order.metadata?.referenceId;
              if (referenceId) {
                   // Logica de confirmacion cuando el OXXO/SPEI es pagado

                   const Ride = require('../models/Ride');
                   const ride = await Ride.findById(referenceId);
                   if (ride && (ride.paymentStatus === 'HOLD' || ride.paymentStatus === 'PENDING')) {
                        ride.paymentStatus = 'CAPTURED';
                        await ride.save();
                        
                        const { getIO } = require('../sockets');
                        getIO().to(`ride_${referenceId}`).emit('payment_confirmed', { rideId: referenceId, method: 'CONEKTA' });
                   }
              }
         }
         
         res.status(200).send('Webhook Processed');
    } catch(e) {
         console.error('[Conekta Webhook Error]', e.message);
         res.status(500).send('Error processing Conekta webhook');
    }
});

module.exports = router;
