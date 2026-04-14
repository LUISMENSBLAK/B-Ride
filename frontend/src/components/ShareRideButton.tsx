import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Share, Alert } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';

interface ShareRideButtonProps {
  rideId: string;
  driverName?: string;
  vehiclePlate?: string;
  style?: any;
}

/**
 * S3: Compartir viaje en tiempo real
 */
export default function ShareRideButton({ rideId, driverName, vehiclePlate, style }: ShareRideButtonProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();

  const handleShare = async () => {
    try {
      // URL de tracking en tiempo real (cuando se implemente web)
      const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace('/api', '') || 'https://b-ride-production.up.railway.app';
      const trackingUrl = `${API_BASE}/track/${rideId}`;

      const message = t('share.message', {
        defaultValue: `🚗 Estoy viajando con B-Ride\n` +
          `Conductor: ${driverName || 'Asignado'}\n` +
          `Placa: ${vehiclePlate || 'N/A'}\n` +
          `Seguimiento: ${trackingUrl}`,
      });

      await Share.share({
        message,
        title: t('share.title', { defaultValue: 'Mi viaje en B-Ride' }),
      });
    } catch (error: unknown) {
      if (e.message !== 'User did not share') {
        Alert.alert('Error', 'No se pudo compartir el viaje');
      }
    }
  };

  return (
    <TouchableOpacity
      style={[styles.shareBtn, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style]}
      onPress={handleShare}
      activeOpacity={0.7}
    >
      <Text style={[styles.shareIcon]}>📤</Text>
      <Text style={[styles.shareText, { color: theme.colors.text }]}>
        {t('share.button', { defaultValue: 'Compartir viaje' })}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  shareIcon: { fontSize: 16 },
  shareText: { fontSize: 14, fontWeight: '600' },
});
