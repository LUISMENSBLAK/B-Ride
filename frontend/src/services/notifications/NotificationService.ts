import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import client from '../../api/client';
import { navigate } from '../../navigation/NavigationService';

// Comportamiento local (Foreground). Como el usuario pidió "Toasts" internos para eventos importantes
// en foreground pero sin ser un push ruidoso, Expo Notifications nos permite configurarlo.
// Configuramos para mostrar un banner (toast superior) incluso si la app está en foreground.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true
    }),
});

/**
 * Pide permisos para Push Notifications, obtiene el token de Expo y lo sube al backend.
 */
export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#F5C518', // B-Ride Gold
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            if (__DEV__) console.log('Fallo al obtener permisos para notificaciones push');
            return null;
        }
        
        try {
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId 
                              ?? Constants?.easConfig?.projectId;
            
            // Si estás en dev/Expo Go sin EAS project ID, pass null o el string
            // Aquí obtienes el Expo push token
            token = (await Notifications.getExpoPushTokenAsync({
                projectId,
            })).data;
            
            // Subir el token al backend
            if (token) {
                await uploadTokenToBackend(token);
            }
        } catch (e) {
            console.error('Error al obtener Expo push token:', e);
        }
    } else {
        if (__DEV__) console.log('Se requiere dispositivo físico para Notificaciones Push (Expo)');
    }

    return token;
}

/**
 * Envia el token obtenido a nuestro endpoint `/api/auth/push-token`
 * Solo si hay un token de autenticación guardado.
 */
async function uploadTokenToBackend(token: string) {
    try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const authToken = await AsyncStorage.getItem('userToken');
        if (!authToken) {
            if (__DEV__) console.log('[NotificationService] Skipping push token upload — no auth token');
            return;
        }
        await client.put('/auth/push-token', { token });
        if (__DEV__) console.log('[NotificationService] Push token registrado en backend:', token);
    } catch (error: any) {
        // Silently ignore 401 — user may not be fully authenticated yet
        if (error?.response?.status === 401) {
            if (__DEV__) console.log('[NotificationService] 401 al subir push token — ignorado');
            return;
        }
        console.error('[NotificationService] Error enviando token al backend:', error);
    }
}

/**
 * Elimina un token específico del backend al cerrar sesión
 */
export async function removeTokenFromBackend(token: string) {
    try {
        await client.delete('/auth/push-token', { data: { token } });
        if (__DEV__) console.log('[NotificationService] Push token removido del backend:', token);
    } catch (error) {
        console.error('[NotificationService] Error removiendo token del backend:', error);
    }
}

/**
 * Hooks globales de Listeners
 */
export function setupNotificationListeners() {
    // 1. Escuchar notificaciones MIENTRAS la app está abierta
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
        if (__DEV__) console.log('[NotificationService] Notificación recibida en foreground:', notification.request.content.data);
        // Podrías manejar lógicas extra aquí (refrescar pantallas), aunque los Sockets
        // ya están haciendo ese trabajo en tiempo real para B-Ride.
    });

    // 2. Escuchar la interacción (tap en la notificación) en TODO momento (foreground/background/cierra app)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        if (__DEV__) console.log('[NotificationService] Tap en Notificación. Navegando con Payload:', data);
        
        // DEEP LINKING: Lógica de ruteo
        if (data && data.screen) {
            // Pasamos `rideId` o info vital en `params`
            navigate(data.screen as string, data);
        }
    });

    return () => {
        foregroundSubscription.remove();
        responseSubscription.remove();
    };
}
