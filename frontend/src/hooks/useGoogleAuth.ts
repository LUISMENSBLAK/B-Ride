import { useEffect, useState, useCallback } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import client from '../api/client';

// Required for Expo AuthSession to close the browser after redirect
WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID_WEB = '1098776842-dummy.apps.googleusercontent.com'; // Replace with real Web Client ID
const GOOGLE_CLIENT_ID_IOS = 'com.googleusercontent.apps.1098776842-ios'; // Replace with real iOS Client ID

// Discovery document for Google OAuth
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
  sub: string;
}

export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID_WEB,
      iosClientId: GOOGLE_CLIENT_ID_IOS,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Token,
      redirectUri: AuthSession.makeRedirectUri({
        scheme: 'bride',
      }),
    },
    discovery
  );

  const handleGoogleLogin = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await promptAsync();
      if (result.type === 'success') {
        const { access_token } = result.params;

        // Fetch user info from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const userInfo: GoogleUser = await userInfoResponse.json();

        // Send to our backend
        const backendResponse = await client.post('/auth/google', {
          email: userInfo.email,
          name: userInfo.name,
          googleId: userInfo.sub,
          avatarUrl: userInfo.picture,
          accessToken: access_token,
        });

        setLoading(false);
        return backendResponse.data;
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        setLoading(false);
        return null;
      }
    } catch (e: any) {
      setError(e.message || 'Error con Google Sign-In');
      setLoading(false);
      throw e;
    }
    setLoading(false);
    return null;
  }, [promptAsync]);

  return { handleGoogleLogin, loading, error, ready: !!request };
}
