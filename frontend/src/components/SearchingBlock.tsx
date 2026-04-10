import { useAppTheme } from '../hooks/useAppTheme';
/**
 * SearchingBlock — Estado "Buscando conductor" con PulsingDots premium.
 *
 * Estructura:
 *  <searchingContainer>
 *    <searchingContent>   ← PulsingDots + título rotatorio + subtítulo
 *    <cancelRequestBtn>   ← full-width pill con scale feedback
 *
 * Props:
 *  status    — 'REQUESTING' | 'REQUESTED' | 'SEARCHING' | 'NEGOTIATING'
 *  onCancel  — callback del botón
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import PulsingDots from './PulsingDots';
import { theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';

// ─── Rotating text interval (ms) ─────────────────────────────────────────────
const ROTATE_INTERVAL = 2500;

interface Props {
  status: 'REQUESTING' | 'REQUESTED' | 'SEARCHING' | 'NEGOTIATING';
  onCancel: () => void;
}

export default function SearchingBlock({
 status, onCancel }: Props) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t, lang } = useTranslation();

  // ── Rotating subtitle texts (bilingual) ───────────────────────────────────
  const ROTATING_ES = [
    'Buscando conductor...',
    'Contactando vehículos cercanos...',
    'Encontrando la mejor opción...',
    'Procesando tu solicitud...',
  ];
  const ROTATING_EN = [
    'Looking for a driver...',
    'Finding the best option...',
    'Connecting with nearby drivers...',
  ];
  const rotatingTexts = lang === 'en' ? ROTATING_EN : ROTATING_ES;
  const [textIndex, setTextIndex] = useState(0);
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'REQUESTING') return;
    const interval = setInterval(() => {
      // Fade out → swap text → fade in
      textOpacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.ease) }, (done) => {
        if (done) {
          runOnJS(setTextIndex)((prev: number) => (prev + 1) % rotatingTexts.length);
          textOpacity.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.ease) });
        }
      });
    }, ROTATE_INTERVAL);
    return () => clearInterval(interval);
  }, [status]);

  const textAnimStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  // ── Block entrance animation (fade + translateY) ───────────────────────────
  const blockOpacity   = useSharedValue(0);
  const blockTranslate = useSharedValue(20);

  useEffect(() => {
    blockOpacity.value   = withTiming(1, { duration: 380, easing: Easing.out(Easing.ease) });
    blockTranslate.value = withSpring(0, { damping: 18, stiffness: 120 });
  }, []);

  const blockAnimStyle = useAnimatedStyle(() => ({
    opacity:   blockOpacity.value,
    transform: [{ translateY: blockTranslate.value }],
  }));

  // ── Cancel button scale feedback ──────────────────────────────────────────
  const cancelScale = useSharedValue(1);
  const cancelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cancelScale.value }],
  }));

  const handlePressIn  = () => { cancelScale.value = withSpring(0.96, { damping: 12 }); };
  const handlePressOut = () => { cancelScale.value = withSpring(1.0,  { damping: 12 }); };

  // ── Content ───────────────────────────────────────────────────────────────
  const isRequesting = status === 'REQUESTING';
  const mainText     = isRequesting
    ? t('searching.sending')
    : rotatingTexts[textIndex];
  const subText      = isRequesting
    ? t('searching.sendingSubtitle')
    : t('searching.lookingSubtitle');

  return (
    <Animated.View style={[styles.container, blockAnimStyle]}>

      {/* ── Content block ── */}
      <View style={styles.content}>
        {/* PulsingDots instead of Loader */}
        <View style={styles.dotsWrapper}>
          <PulsingDots size={14} gap={16} />
        </View>

        <Animated.Text style={[styles.title, textAnimStyle]}>
          {mainText}
        </Animated.Text>

        <Text style={styles.subtitle}>{subText}</Text>
      </View>

      {/* ── Cancel button — full width pill ── */}
      <Animated.View style={[styles.cancelBtnOuter, cancelAnimStyle]}>
        <Pressable
          style={styles.cancelBtn}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('searching.cancel')}
        >
          <Text style={styles.cancelBtnText}>{t('searching.cancel')}</Text>
        </Pressable>
      </Animated.View>

    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const getStyles = (theme: any) => StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 28,
    paddingBottom: 36,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  dotsWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
    // Subtle blue glow
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: theme.spacing.xs,
    lineHeight: 26,
  },
  subtitle: {
    ...theme.typography.bodyMuted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  cancelBtnOuter: {
    width: '100%',
  },
  cancelBtn: {
    width: '100%',
    backgroundColor: theme.colors.surfaceHigh,
    paddingVertical: 15,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.error,
    letterSpacing: 0.1,
  },
});
