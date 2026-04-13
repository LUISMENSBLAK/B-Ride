import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import auth from '@react-native-firebase/auth';
import client from '../api/client';

export function useAppleAuth() {
  const [loading, setLoading] = useState(false);

  const handleAppleLogin = useCallback(async () => {
    if (Platform.OS !== 'ios') return null;
    setLoading(true);
    try {
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!appleCredential.identityToken) throw new Error('No se obtuvo identity token de Apple.');

      // Crear credencial de Firebase con el token de Apple
      const { identityToken, nonce } = appleCredential;
      const appleAuthProvider = auth.AppleAuthProvider.credential(identityToken, nonce);
      const userCredential = await auth().signInWithCredential(appleAuthProvider);

      // Obtener Firebase ID Token
      const firebaseToken = await userCredential.user.getIdToken();

      const fullName = appleCredential.fullName
        ? `${appleCredential.fullName.givenName || ''} ${appleCredential.fullName.familyName || ''}`.trim()
        : userCredential.user.displayName;

      // Sincronizar con el backend de B-Ride
      const backendResponse = await client.post('/auth/firebase-sync', {
        name: fullName || undefined,
      }, {
        headers: { Authorization: `Bearer ${firebaseToken}` }
      });

      setLoading(false);
      return backendResponse.data;
    } catch (error: any) {
      setLoading(false);
      if (error.code === 'ERR_REQUEST_CANCELED') return null;
      throw error;
    }
  }, []);

  return { handleAppleLogin, loading };
}
