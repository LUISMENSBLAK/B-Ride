import { useState, useCallback } from 'react';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';
import client from '../api/client';

// Client IDs extraídos de los archivos de credenciales de Firebase:
// Web (client_type 3) → google-services.json
// iOS (client_type 2) → GoogleService-Info.plist
const WEB_CLIENT_ID = '268090641188-e0it1i3nuin2pg9vglsakfdtctuafblc.apps.googleusercontent.com';
const IOS_CLIENT_ID = '268090641188-76v04oaddhnl4p7e01okmff3j49803ro.apps.googleusercontent.com';

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  iosClientId: IOS_CLIENT_ID,
  offlineAccess: true,
  scopes: ['profile', 'email'],
});

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
      const err = error as { message?: string; code?: string; response?: any };
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (err.code === statusCodes.IN_PROGRESS) return null;
      throw error;
    }
  }, []);

  return { handleGoogleLogin, loading, ready: true };
}
