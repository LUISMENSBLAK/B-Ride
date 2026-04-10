import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { registerForPushNotificationsAsync, setupNotificationListeners } from './src/services/notifications/NotificationService';
import { useAuthStore } from './src/store/authStore';
import { initLocale } from './src/services/i18n';
import AnimatedSplash from './src/components/AnimatedSplash';

export default function App() {

  useEffect(() => {
    // Inicializar idioma guardado en AsyncStorage
    initLocale();

    // Configurar listeners para tap on push etc.
    const unsubscribe = setupNotificationListeners();

    // Solo pedimos permisos e intentamos registrar el token al abrir la app.
    registerForPushNotificationsAsync();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AnimatedSplash>
        <SafeAreaProvider>
          <AppNavigator />
        </SafeAreaProvider>
      </AnimatedSplash>
    </GestureHandlerRootView>
  );
}
