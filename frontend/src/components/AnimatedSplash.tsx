/**
 * AnimatedSplash — Splash screen Wixárika con fade-in + scale del logo.
 *
 * - Siempre usa fondo oscuro (#0D0520), independiente del tema del sistema
 * - Logo fade-in (0→1) + scale (0.95→1.0) con Reanimated
 * - Glow sutil dorado alrededor del logo
 * - Fade-out suave hacia el contenido de la app
 * - Timeout fallback de 2s para evitar bloqueos
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { theme } from '../theme';

// Mantener splash nativo visible hasta que lo ocultemos
SplashScreen.preventAutoHideAsync().catch(() => {});

const { width: SCREEN_W } = Dimensions.get('window');
const LOGO_SIZE = SCREEN_W * 0.38;
const SPLASH_DURATION = 600;
const FADE_OUT_DURATION = 400;
const TIMEOUT_FALLBACK = 2000;

interface Props {
  children: React.ReactNode;
  onFinish?: () => void;
}

export default function AnimatedSplash({ children, onFinish }: Props) {
  // Splash is ALWAYS dark — uses static theme, not dynamic hook
  const [appReady, setAppReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  const logoOpacity = useSharedValue(0);
  const logoScale = useSharedValue(0.95);
  const splashOpacity = useSharedValue(1);

  const finishSplash = useCallback(() => {
    setSplashDone(true);
    onFinish?.();
  }, [onFinish]);

  const startFadeOut = useCallback(() => {
    splashOpacity.value = withTiming(0, {
      duration: FADE_OUT_DURATION,
      easing: Easing.out(Easing.ease),
    }, (done) => {
      if (done) runOnJS(finishSplash)();
    });
  }, []);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    logoOpacity.value = withTiming(1, {
      duration: SPLASH_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    logoScale.value = withTiming(1, {
      duration: SPLASH_DURATION,
      easing: Easing.out(Easing.cubic),
    });

    const animTimer = setTimeout(() => {
      setAppReady(true);
      startFadeOut();
    }, SPLASH_DURATION + 300);

    const fallbackTimer = setTimeout(() => {
      setAppReady(true);
      startFadeOut();
    }, TIMEOUT_FALLBACK);

    return () => {
      clearTimeout(animTimer);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const splashAnimStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
  }));

  return (
    <View style={styles.root}>
      {appReady && children}

      {!splashDone && (
        <Animated.View style={[styles.splashContainer, splashAnimStyle]}>
          <Animated.View style={[styles.logoGlow, logoAnimStyle]}>
            <Image
              source={require('../../assets/ride.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.Text style={[styles.appName, logoAnimStyle]}>
            B-Ride
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

// Static styles — splash is ALWAYS dark mode (#0D0520)
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background, // #0D0520
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.background, // #0D0520 always
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logoGlow: {
    // Subtle golden glow around logo
    shadowColor: theme.colors.primary,  // #F5C518
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE * 0.22,
  },
  appName: {
    marginTop: 20,
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,  // Dorado maíz
    letterSpacing: -0.5,
  },
});
