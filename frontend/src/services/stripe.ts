/**
 * Stripe Frontend Service — Hardened for production.
 *
 * Features:
 * - Idempotency key generation to prevent duplicate intents
 * - Timeout handling (15s)
 * - Double-tap guard
 * - Clear state management (idle → loading → success/error)
 */
import client from '../api/client';
import { v4 as uuidv4 } from 'uuid';

// ─── Double-tap guard ────────────────────────────────────────────────────────
let _paymentInFlight = false;

export type PaymentState = 'idle' | 'loading' | 'success' | 'error';

export interface PaymentResult {
  state: PaymentState;
  clientSecret?: string;
  paymentIntentId?: string;
  error?: string;
}

// ─── Timeout wrapper ─────────────────────────────────────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timeout after ${ms}ms`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export const stripeFrontendService = {
  getOnboardingLink: async () => {
    const response = await client.post('/payment/onboard');
    return response.data;
  },

  checkOnboardingStatus: async () => {
    const response = await client.get('/payment/onboard-status');
    return response.data;
  },

  /**
   * Create payment intent with production guards.
   * Returns structured PaymentResult with state tracking.
   */
  createPaymentIntent: async (
    rideId: string,
    bidId: string
  ): Promise<PaymentResult> => {
    // Double-tap guard
    if (_paymentInFlight) {
      return { state: 'error', error: 'Payment already in progress.' };
    }

    _paymentInFlight = true;
    const idempotencyKey = uuidv4();

    try {
      const response = await withTimeout(
        client.post('/payment/intent', {
          rideId,
          bidId,
          idempotencyKey,
        }),
        15000, // 15s timeout
        'createPaymentIntent'
      );

      if (response.data.success) {
        return {
          state: 'success',
          clientSecret: response.data.clientSecret,
          paymentIntentId: response.data.paymentIntentId,
        };
      }

      return {
        state: 'error',
        error: response.data.message || 'Payment creation failed.',
      };
    } catch (err: any) {
      const isTimeout = err.message?.includes('timeout');
      return {
        state: 'error',
        error: isTimeout
          ? 'El pago tardó demasiado. Intenta de nuevo.'
          : err.response?.data?.message || err.message || 'Error desconocido.',
      };
    } finally {
      _paymentInFlight = false;
    }
  },

  /** Check if a payment is currently in flight (for UI guards) */
  isPaymentInFlight: () => _paymentInFlight,
};
