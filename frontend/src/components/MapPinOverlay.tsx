/**
 * MapPinOverlay — B-Ride v2
 * ─────────────────────────────────────────────────────────────
 * Componente PURO de presentación del pin central.
 * NO contiene lógica de posicionamiento absoluto propio —
 * el padre (PassengerDashboard) lo envuelve en el contenedor
 * correcto (position:absolute, top:0/left:0/right:0/bottom:0,
 * pointerEvents:"none", alignItems/justifyContent:center).
 *
 * Renderiza:
 *  - Bubble de dirección (fade animado)
 *  - Pin SVG B-Ride (halo + círculo + punto central)
 *  - Sombra oval animada
 * ─────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '../hooks/useAppTheme';

type MapSelectionMode = 'none' | 'pickup' | 'destination';

interface MapPinOverlayProps {
  mode: MapSelectionMode;
  isDragging: boolean;
  pendingAddress: string;
}

export default function MapPinOverlay({
  mode,
  isDragging,
  pendingAddress,
}: MapPinOverlayProps) {
  const theme = useAppTheme();

  // ── Pin elevation ──────────────────────────────────────────
  const pinY      = useSharedValue(0);
  const haloSize  = useSharedValue(44);
  const haloOpacity = useSharedValue(0.20);

  // ── Shadow ─────────────────────────────────────────────────
  const shadowW   = useSharedValue(20);
  const shadowOp  = useSharedValue(0.35);

  // ── Address bubble ─────────────────────────────────────────
  const bubbleOp  = useSharedValue(pendingAddress && !isDragging ? 1 : 0);

  useEffect(() => {
    if (isDragging) {
      pinY.value      = withSpring(-12, { damping: 12, stiffness: 180 });
      haloSize.value  = withSpring(56,  { damping: 14, stiffness: 160 });
      haloOpacity.value = withTiming(0.35, { duration: 150 });
      shadowW.value   = withSpring(14,  { damping: 14, stiffness: 180 });
      shadowOp.value  = withTiming(0.20, { duration: 150 });
      bubbleOp.value  = withTiming(0,   { duration: 80 });
    } else {
      pinY.value      = withSpring(0,   { damping: 15, stiffness: 200 });
      haloSize.value  = withSpring(44,  { damping: 15, stiffness: 200 });
      haloOpacity.value = withTiming(0.20, { duration: 200 });
      shadowW.value   = withSpring(20,  { damping: 15, stiffness: 200 });
      shadowOp.value  = withTiming(0.35, { duration: 200 });
      if (pendingAddress) {
        bubbleOp.value = withTiming(1, { duration: 200 });
      }
    }
  }, [isDragging, pendingAddress]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pinY.value }],
    alignItems: 'center',
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    width: shadowW.value,
    opacity: shadowOp.value,
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOp.value,
  }));

  const haloStyle = useAnimatedStyle(() => ({
    width: haloSize.value,
    height: haloSize.value,
    borderRadius: haloSize.value / 2,
    opacity: haloOpacity.value,
  }));

  const isPickup = mode === 'pickup';
  // Pickup → turquesa, Destination → gold
  const pinColor = isPickup ? theme.colors.success : theme.colors.primary;

  return (
    <View style={styles.wrapper} pointerEvents="none">

      {/* 1. Address bubble — fade animato */}
      <Animated.View style={[styles.bubble, bubbleStyle]}>
        {!!pendingAddress && (
          <Text style={styles.bubbleText} numberOfLines={2}>{pendingAddress}</Text>
        )}
      </Animated.View>

      {/* 2. Pin principal (halo + circle + dot) */}
      <Animated.View style={pinStyle}>
        {/* Halo exterior */}
        <Animated.View style={[styles.haloBase, haloStyle, { backgroundColor: pinColor }]} />

        {/* Círculo interior 28px */}
        <View style={[styles.pinCircle, { backgroundColor: pinColor }]}>
          {/* Punto central 10px */}
          <View style={[styles.pinDot, { backgroundColor: theme.colors.background }]} />
        </View>
      </Animated.View>

      {/* 3. Sombra oval */}
      <Animated.View style={[styles.shadowBase, shadowStyle]} />

    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Bubble
  bubble: {
    backgroundColor: 'rgba(13,5,32,0.90)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.40)',
    maxWidth: 220,
    marginBottom: 8,
  },
  bubbleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Halo (position absolute centered on the circle)
  haloBase: {
    position: 'absolute',
    alignSelf: 'center',
  },

  // ── Circle
  pinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Dot
  pinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // ── Shadow
  shadowBase: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.35)',
    marginTop: 2,
  },
});
