import { createNavigationContainerRef, NavigationContainerRef } from '@react-navigation/native';

// Tipo de RootStackParamList de la app. Para simplificar, usamos any 
// si las rutas son dinámicas, o podrías definir tu RootStackParamList exacto.
export const navigationRef = createNavigationContainerRef<any>();

/**
 * Función global para navegar desde fuera de los componentes React (ej. Push Service).
 * Se asume que el ref ya está montado (`isReady()`).
 * @param name Nombre de la pantalla
 * @param params Parámetros a pasar
 */
export function navigate(name: string, params?: any) {
    if (navigationRef.isReady()) {
        navigationRef.navigate(name, params);
    } else {
        console.warn(`[NavigationService] Intento de navegar a ${name} antes de que Container esté listo.`);
        // Podrías implementar una cola de navegación pending en caso de Cold Start
    }
}
