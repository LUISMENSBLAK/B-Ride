import { useState, useCallback } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import client from '../api/client';

export function useAppleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAppleLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Apple only provides name/email on the FIRST sign-in.
      // After that, they return null. We send whatever we have.
      const fullName = credential.fullName
        ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
        : undefined;

      const backendResponse = await client.post('/auth/apple', {
        appleUserId: credential.user,
        email: credential.email || undefined,
        name: fullName || undefined,
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
      });

      setLoading(false);
      return backendResponse.data;
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled — not an error
        setLoading(false);
        return null;
      }
      setError(e.message || 'Error con Apple Sign-In');
      setLoading(false);
      throw e;
    }
  }, []);

  return { handleAppleLogin, loading, error };
}
