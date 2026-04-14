import axios from 'axios';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';


const defaultURL = Platform.OS === 'android' ? 'https://b-ride-production.up.railway.app/api' : 'https://b-ride-production.up.railway.app/api';
const baseURL = process.env.EXPO_PUBLIC_API_URL || defaultURL;

if (!process.env.EXPO_PUBLIC_API_URL) {
    console.warn(
        '[API Client] ⚠️ EXPO_PUBLIC_API_URL no está definida. ' +
        'Usando fallback a ' + defaultURL + '. ' +
        'En producción configúrala con: eas secret:create --name EXPO_PUBLIC_API_URL --value https://tu-backend.railway.app/api'
    );
}


const client = axios.create({
    baseURL,
    timeout: 10000,
});

client.interceptors.request.use(
    async (config) => {
        try {
            const firebaseUser = auth().currentUser;
            if (firebaseUser) {
                const token = await firebaseUser.getIdToken();
                config.headers['Authorization'] = `Bearer ${token}`;
            } else {
                // Fallback a token guardado en AsyncStorage (usuarios legacy)
                const savedToken = await AsyncStorage.getItem('userToken');
                if (savedToken) config.headers['Authorization'] = `Bearer ${savedToken}`;
            }
        } catch (e) {
            if (__DEV__) console.log('[API Client] Error obteniendo token:', e);
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

client.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;


        if (!error.response) {
            // Solo mostrar alerta si no es un retry interno
            if (!originalRequest._networkAlertShown) {
                originalRequest._networkAlertShown = true;
                Alert.alert(
                    'Sin conexión',
                    'Verifica tu internet e intenta de nuevo.',
                    [{ text: 'OK' }]
                );
            }
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = await AsyncStorage.getItem('refreshToken');
                if (!refreshToken) {
                    const { useAuthStore } = require('../store/authStore');
                    useAuthStore.getState().logout();
                    return Promise.reject(error);
                }

                const res = await axios.post(`${baseURL}/auth/refresh`, { token: refreshToken });

                if (res.data.success && res.data.accessToken) {
                    const newAccessToken = res.data.accessToken;
                    const newRefreshToken = res.data.refreshToken;
                    
                    await AsyncStorage.setItem('userToken', newAccessToken);
                    if (newRefreshToken) await AsyncStorage.setItem('refreshToken', newRefreshToken);
                    
                    const { useAuthStore } = require('../store/authStore');
                    if (useAuthStore.getState().user) {
                        useAuthStore.getState().updateUser({ 
                            accessToken: newAccessToken,
                            ...(newRefreshToken && { refreshToken: newRefreshToken })
                        });
                    }

                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return client(originalRequest);
                }
            } catch (err) {
                try {
                    const { useAuthStore } = require('../store/authStore');
                    await useAuthStore.getState().logout();
                } catch {
                    await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo', 'lastCompletedRideId']);
                }
                return Promise.reject(err);
            }
        }

        return Promise.reject(error);
    }
);

export default client;
