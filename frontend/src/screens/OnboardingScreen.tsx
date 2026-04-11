import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  useAnimatedScrollHandler, interpolate, Extrapolation,
} from 'react-native-reanimated';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface OnboardingProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    emoji: '🚗',
    titleKey: 'onboarding.slide1Title',
    subtitleKey: 'onboarding.slide1Sub',
    defaults: { title: 'Bienvenido a B-Ride', sub: 'Tu viaje seguro y económico comienza aquí' },
  },
  {
    emoji: '💰',
    titleKey: 'onboarding.slide2Title',
    subtitleKey: 'onboarding.slide2Sub',
    defaults: { title: 'Negocia tu precio', sub: 'Los conductores compiten por tu viaje — tú decides cuánto pagar' },
  },
  {
    emoji: '🛡️',
    titleKey: 'onboarding.slide3Title',
    subtitleKey: 'onboarding.slide3Sub',
    defaults: { title: 'Viaja seguro', sub: 'Conductores verificados, botón SOS y seguimiento en tiempo real' },
  },
  {
    emoji: '📍',
    titleKey: 'onboarding.slide4Title',
    subtitleKey: 'onboarding.slide4Sub',
    defaults: { title: '¡Empieza ahora!', sub: 'Activa tu ubicación y solicita tu primer viaje' },
  },
];

/**
 * UX-A: Pantalla de onboarding para nuevos usuarios
 */
export default function OnboardingScreen({ onComplete }: OnboardingProps) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    } else {
      handleDone();
    }
  };

  const handleDone = async () => {
    await AsyncStorage.setItem('onboardingComplete', 'true');
    onComplete();
  };

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
      >
        {SLIDES.map((slide, index) => (
          <View key={index} style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{slide.emoji}</Text>
            <Text style={styles.slideTitle}>
              {t(slide.titleKey, { defaultValue: slide.defaults.title })}
            </Text>
            <Text style={styles.slideSubtitle}>
              {t(slide.subtitleKey, { defaultValue: slide.defaults.sub })}
            </Text>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.bottomRow}>
        {currentIndex < SLIDES.length - 1 && (
          <TouchableOpacity onPress={handleDone}>
            <Text style={styles.skipText}>{t('onboarding.skip', { defaultValue: 'Omitir' })}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
          <Text style={styles.nextBtnText}>
            {currentIndex === SLIDES.length - 1
              ? t('onboarding.start', { defaultValue: 'Empezar' })
              : t('onboarding.next', { defaultValue: 'Siguiente' })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  slide: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emoji: { fontSize: 80, marginBottom: 32 },
  slideTitle: { ...theme.typography.header, fontSize: 28, textAlign: 'center', marginBottom: 16 },
  slideSubtitle: { ...theme.typography.bodyMuted, fontSize: 16, textAlign: 'center', lineHeight: 24 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  dotActive: { backgroundColor: theme.colors.primary, width: 24 },
  bottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: Platform.OS === 'ios' ? 48 : 32,
  },
  skipText: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 16 },
  nextBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  nextBtnText: { ...theme.typography.button, fontSize: 16 },
});
