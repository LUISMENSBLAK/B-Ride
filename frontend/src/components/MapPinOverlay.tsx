/**
 * MapPinOverlay
 * ─────────────────────────────────────────────────────────────
 * Overlay de selección de punto en el mapa (modo "Fijar en mapa").
 * Renderiza:
 *  - Banner de instrucción (arriba, centrado)
 *  - Pin central fijo con animación de elevación al arrastrar
 *  - Bubble con dirección (cuando el usuario suelta el mapa)
 *  - Botón de confirmación (visible solo cuando no arrastra)
 * ─────────────────────────────────────────────────────────────
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';

type MapSelectionMode = 'none' | 'pickup' | 'destination';

interface MapPinOverlayProps {
  mode: MapSelectionMode;
  isDragging: boolean;
  pendingAddress: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MapPinOverlay({
  mode,
  isDragging,
  pendingAddress,
  onConfirm,
  onCancel,
}: MapPinOverlayProps) {
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();

  // ── Pin elevation animation ───────────────────────────────
  const pinTranslateY = useSharedValue(0);
  const shadowScale   = useSharedValue(1);

  useEffect(() => {
    if (isDragging) {
      pinTranslateY.value = withSpring(-10, { damping: 12, stiffness: 180 });
      shadowScale.value   = withSpring(1.6, { damping: 14, stiffness: 160 });
    } else {
      pinTranslateY.value = withSpring(0, { damping: 14, stiffness: 200 });
      shadowScale.value   = withSpring(1, { damping: 14, stiffness: 200 });
    }
  }, [isDragging]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pinTranslateY.value }],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: shadowScale.value }],
    opacity: isDragging ? 0.25 : 0.45,
  }));

  // ── Confirm button animation ──────────────────────────────
  const btnScale   = useSharedValue(isDragging ? 0 : 1);
  const btnOpacity = useSharedValue(isDragging ? 0 : 1);

  useEffect(() => {
    if (isDragging) {
      btnOpacity.value = withTiming(0, { duration: 100 });
      btnScale.value   = withTiming(0.85, { duration: 100 });
    } else {
      btnScale.value   = withSpring(1, { damping: 12, stiffness: 200 });
      btnOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isDragging]);

  const btnStyle = useAnimatedStyle(() => ({
    opacity: btnOpacity.value,
    transform: [{ scale: btnScale.value }],
  }));

  if (mode === 'none') return null;

  const isPickup      = mode === 'pickup';
  const pinColor      = isPickup ? theme.colors.success : theme.colors.primary;
  const bannerText    = isPickup
    ? 'Mueve el mapa a tu punto de recogida'
    : 'Mueve el mapa a tu destino';
  const confirmLabel  = isPickup
    ? '✓  Confirmar punto de recogida'
    : '✓  Confirmar destino';

  const bannerTop = insets.top + 70;
  const btnBottom = insets.bottom + 100;

  return (
    <>
      {/* ── Instruction banner ─────────────────────────────── */}
      <View
        style={[styles.banner, { top: bannerTop }]}
        pointerEvents="box-none"
      >
        <Text style={styles.bannerText}>{bannerText}</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* ── Center pin (pointer-events: none — never blocks map) ── */}
      <View style={styles.pinWrapper} pointerEvents="none">
        {/* Address bubble */}
        {!isDragging && !!pendingAddress && (
          <View style={styles.addressBubble}>
            <Text style={styles.addressText} numberOfLines={2}>{pendingAddress}</Text>
          </View>
        )}

        {/* Animated pin */}
        <Animated.View style={pinStyle}>
          <Ionicons name="location" size={44} color={pinColor} />
        </Animated.View>

        {/* Shadow ellipse */}
        <Animated.View style={[styles.pinShadow, shadowStyle, { backgroundColor: pinColor }]} />
      </View>

      {/* ── Confirm button ─────────────────────────────────── */}
      <Animated.View
        style={[styles.confirmBtnWrapper, { bottom: btnBottom }, btnStyle]}
        pointerEvents={isDragging ? 'none' : 'auto'}
      >
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: theme.colors.primary, ...theme.shadows.primary }]}
          onPress={onConfirm}
          activeOpacity={0.85}
        >
          <Text style={[styles.confirmBtnText, { color: theme.colors.primaryText }]}>
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // ── Banner
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(13,5,32,0.85)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.30)',
    zIndex: 60,
    // iOS blur not available natively without @react-native-community/blur,
    // so we use a high-opacity dark background instead.
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  bannerText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Center pin
  pinWrapper: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    // Shift so the TIP of the 44px icon is exactly on center:
    // icon is ~44px tall, tip is at the bottom → offset up by 44px, left by 22px
    marginLeft: -22,
    marginTop: -44,
    alignItems: 'center',
    zIndex: 55,
  },
  addressBubble: {
    backgroundColor: 'rgba(13,5,32,0.88)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
    maxWidth: 220,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  pinShadow: {
    width: 18,
    height: 6,
    borderRadius: 9,
    marginTop: -2,
    opacity: 0.4,
  },

  // ── Confirm button
  confirmBtnWrapper: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 60,
  },
  confirmBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
