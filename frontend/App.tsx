import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotificationsAsync, setupNotificationListeners } from './src/services/notifications/NotificationService';
import { useAuthStore } from './src/store/authStore';
import { initLocale } from './src/services/i18n';
import AnimatedSplash from './src/components/AnimatedSplash';
import ErrorBoundary from './src/components/ErrorBoundary';
import { useSettings } from './src/hooks/useSettings';

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

export default function App() {

  useEffect(() => {
    initLocale();
    useSettings.getState().loadSettings();
    const unsubscribe = setupNotificationListeners();
    registerForPushNotificationsAsync();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <ErrorBoundary>
      <StripeProvider
        publishableKey={STRIPE_PUBLISHABLE_KEY}
        merchantIdentifier="merchant.com.bride.app"
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AnimatedSplash>
            <SafeAreaProvider>
              <AppNavigator />
            </SafeAreaProvider>
          </AnimatedSplash>
        </GestureHandlerRootView>
      </StripeProvider>
    </ErrorBoundary>
  );
}
