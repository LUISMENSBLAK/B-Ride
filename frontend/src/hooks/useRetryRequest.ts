/**
 * Bloque 17: Hook para retry automático en requests HTTP.
 * Manejo de edge cases: offline, timeout, server error.
 */

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import client from '../api/client';

interface UseRetryRequestOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  showOfflineAlert?: boolean;
}

export function useRetryRequest(options: UseRetryRequestOptions = {}) {
  const { maxRetries = 3, retryDelayMs = 1500, showOfflineAlert = true } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);

  const execute = useCallback(async <T>(
    requestFn: () => Promise<T>,
    onSuccess?: (data: T) => void,
    onFail?: (err: any) => void,
  ): Promise<T | null> => {
    // Check network
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      if (showOfflineAlert) {
        Alert.alert('Sin conexión', 'Verifica tu conexión a internet e intenta de nuevo.');
      }
      setError('offline');
      onFail?.({ message: 'offline' });
      return null;
    }

    setLoading(true);
    setError(null);
    retryCount.current = 0;

    while (retryCount.current <= maxRetries) {
      try {
        const result = await requestFn();
        setLoading(false);
        onSuccess?.(result);
        return result;
      } catch (error: any) {
        retryCount.current++;

        const status = error.response?.status;
        // No reintentar en errores de cliente (4xx) excepto 429
        if (status && status >= 400 && status < 500 && status !== 429) {
          setLoading(false);
          setError(error.response?.data?.message || 'Error del servidor');
          onFail?.(error);
          return null;
        }

        if (retryCount.current > maxRetries) {
          setLoading(false);
          setError('Servidor no disponible');
          onFail?.(error);
          return null;
        }

        // Esperar antes de reintentar (exponential backoff)
        await new Promise(r => setTimeout(r, retryDelayMs * retryCount.current));
      }
    }

    setLoading(false);
    return null;
  }, [maxRetries, retryDelayMs, showOfflineAlert]);

  return { execute, loading, error };
}
