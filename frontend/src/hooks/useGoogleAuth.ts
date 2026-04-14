import { useState, useCallback } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import client from '../api/client';

// WEB_CLIENT_ID: se obtiene de Firebase Console → Authentication → Google → 
// Web SDK configuration → Web client ID
// También está en google-services.json como "client_id" con "client_type": 3
const WEB_CLIENT_ID = 'TU_WEB_CLIENT_ID.apps.googleusercontent.com';

// Configuración robusta de Google Sign-In
// En iOS, si no existe GoogleService-Info.plist, iosClientId es OBLIGATORIO.
try {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'PENDIENTE_WEB',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'PENDIENTE_IOS',
    offlineAccess: true,
    scopes: ['profile', 'email'],
  });
} catch (configError: any) {
  console.warn('[GoogleSignin] Error de configuración inicial:', configError.message);
}

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();

      if (!idToken) throw new Error('No se obtuvo el ID token de Google.');

      // Autenticar en Firebase con el token de Google
      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      const userCredential = await auth().signInWithCredential(googleCredential);
      
      // Obtener Firebase ID Token para el backend
      const firebaseToken = await userCredential.user.getIdToken();

      // Sincronizar con el backend de B-Ride
      const backendResponse = await client.post('/auth/firebase-sync', {
        name: userCredential.user.displayName,
        avatarUrl: userCredential.user.photoURL,
      }, {
        headers: { Authorization: `Bearer ${firebaseToken}` }
      });

      setLoading(false);
      return backendResponse.data;
    } catch (error: unknown) {
      setLoading(false);
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS) return null;
      throw error;
    }
  }, []);

  return { handleGoogleLogin, loading, ready: true };
}
