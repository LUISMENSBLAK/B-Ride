import React, { useRef } from 'react';
import { View, Text, StyleSheet, Alert, Linking, Platform, Animated } from 'react-native';
import { LongPressGestureHandler, State } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useAppTheme } from '../hooks/useAppTheme';
import { useAuthStore } from '../store/authStore';
import client from '../api/client';

interface SOSButtonProps {
  rideId: string;
  style?: any;
}

export default function SOSButton({ rideId, style }: SOSButtonProps) {
  const theme = useAppTheme();
  const { user } = useAuthStore();
  const progress = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);

  const triggerSOS = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await client.post(`/rides/${rideId}/sos`, {
        location: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      });
    } catch (e) {}
    const emergencyNumber = Platform.OS === 'ios' ? 'telprompt:911' : 'tel:911';
    Linking.openURL(emergencyNumber);
  };

  const onHandlerStateChange = ({ nativeEvent }: any) => {
    if (nativeEvent.state === State.BEGAN) {
      scaleAnim.setValue(0.9);
      holdAnim.current = Animated.timing(progress, {
        toValue: 1, duration: 1500, useNativeDriver: false,
      });
      holdAnim.current.start(({ finished }) => {
        if (finished) triggerSOS();
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (nativeEvent.state === State.END || nativeEvent.state === State.CANCELLED || nativeEvent.state === State.FAILED) {
      holdAnim.current?.stop();
      Animated.parallel([
        Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false }),
      ]).start();
    }
  };

  const arcWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <LongPressGestureHandler onHandlerStateChange={onHandlerStateChange} minDurationMs={0}>
      <Animated.View
        style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }, style]}
        accessibilityLabel="Botón de emergencia SOS"
        accessibilityRole="button"
        accessible={true}
      >
        {/* Anillo de progreso */}
        <View style={styles.progressRing}>
          <Animated.View style={[styles.progressFill, { width: arcWidth }]} />
        </View>
        <View style={styles.inner}>
          <Text style={styles.sosText}>SOS</Text>
          <Text style={styles.holdText}>mantén</Text>
        </View>
      </Animated.View>
    </LongPressGestureHandler>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#E53935',
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  progressRing: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: 3, backgroundColor: '#fff' },
  inner: { alignItems: 'center' },
  sosText: { fontSize: 13, fontWeight: '900', color: '#fff', letterSpacing: 1.5 },
  holdText: { fontSize: 8, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
});
