import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotificationsAsync, setupNotificationListeners } from './src/services/notifications/NotificationService';
import { useAuthStore } from './src/store/authStore';
import { initLocale } from './src/services/i18n';
import AnimatedSplash from './src/components/AnimatedSplash';
import ErrorBoundary from './src/components/ErrorBoundary';

export default function App() {

  useEffect(() => {
    initLocale();
    const unsubscribe = setupNotificationListeners();
    registerForPushNotificationsAsync();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AnimatedSplash>
          <SafeAreaProvider>
            <AppNavigator />
          </SafeAreaProvider>
        </AnimatedSplash>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
