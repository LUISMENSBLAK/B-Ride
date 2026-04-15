/**
 * Firebase configuration for B-Ride.
 *
 * Uses ONLY @react-native-firebase (native SDK).
 * The native SDK reads credentials automatically from:
 *   - iOS:     ios/BRide/GoogleService-Info.plist
 *   - Android: android/app/google-services.json
 *
import { initializeApp, getApps } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';

// By default, @react-native-firebase/app initializes natively via GoogleService-Info.plist.
// If the native module fails to find it (e.g., due to cached builds), this acts as a fallback to prevent crashes.
if (getApps().length === 0) {
  try {
    initializeApp({
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY as string,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string,
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET as string,
    });
    console.log('[Firebase] Explicit fallback initialization complete.');
  } catch (e) {
    console.warn('[Firebase] Fallback initialization error:', e);
  }
}

export { auth };
