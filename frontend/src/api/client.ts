import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

// For Android emulator it usually is 10.0.2.2.
// For iOS simulator, localhost works.
const defaultURL = Platform.OS === 'android' ? 'http://10.0.2.2:5001/api' : 'http://localhost:5001/api';
const baseURL = process.env.EXPO_PUBLIC_API_URL || defaultURL;

const client = axios.create({
    baseURL,
});

client.interceptors.request.use(
    async (config) => {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
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

        // Si la solicitud falla con 401 Unauthorized y no ha sido reintentada todavía
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                // Obtener el refreshToken almacenado
                const refreshToken = await AsyncStorage.getItem('refreshToken');
                if (!refreshToken) {
                    return Promise.reject(error);
                }

                // Generar un nuevo token contra la API (sin usar 'client' para evitar loops)
                const res = await axios.post(`${baseURL}/auth/refresh`, { token: refreshToken });

                if (res.data.success && res.data.accessToken) {
                    const newAccessToken = res.data.accessToken;
                    
                    // Guardar nuevo token persistente
                    await AsyncStorage.setItem('userToken', newAccessToken);

                    // Reintentar la API que falló con los nuevos credenciales
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return client(originalRequest);
                }
            } catch (err) {
                // Si la renovación falla (ej. refresh token inválido o expirado)
                // Limpiamos los datos locales para forzar a la app a desvincularse
                await AsyncStorage.multiRemove(['userToken', 'refreshToken', 'userInfo']);
                return Promise.reject(err);
            }
        }

        return Promise.reject(error);
    }
);

export default client;
