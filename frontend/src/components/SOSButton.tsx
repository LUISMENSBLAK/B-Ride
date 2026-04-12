import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import { useAuthStore } from '../store/authStore';
import client from '../api/client';

interface SOSButtonProps {
  rideId: string;
  otherUserId?: string;
  style?: any;
}

/**
 * S1: Botón SOS — llamar emergencias + enviar evento al backend + registrar incidente
 */
export default function SOSButton({ rideId, otherUserId, style }: SOSButtonProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const handleSOS = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    Alert.alert(
      '🚨 ' + t('sos.title', { defaultValue: 'Emergencia' }),
      t('sos.confirmMsg', { defaultValue: '¿Estás en peligro? Esto llamará a servicios de emergencia y notificará a B-Ride.' }),
      [
        { text: t('general.cancel', { defaultValue: 'Cancelar' }), style: 'cancel' },
        {
          text: t('sos.callEmergency', { defaultValue: 'Llamar 911' }),
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Obtener ubicación actual
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });

              // 2. Enviar evento al backend
              await client.post(`/rides/${rideId}/sos`, {
                location: {
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                }
              });

              Alert.alert('SOS Enviado', 'Se ha alertado a la otra persona y al centro de emergencias corporativo de B-Ride.');

              // 3. Llamar a emergencias (911 en México)
              const emergencyNumber = Platform.OS === 'ios' ? 'telprompt:911' : 'tel:911';
              Linking.openURL(emergencyNumber);

            } catch (e) {
              console.error('[SOS] Error:', e);
              // Aún así intentar llamar a emergencias
              Linking.openURL('tel:911');
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.sosBtn, { backgroundColor: theme.colors.error }, style]}
      onPress={handleSOS}
      activeOpacity={0.7}
    >
      <Text style={styles.sosText}>SOS</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  sosBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  sosText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1,
  },
});
