import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  useAnimatedScrollHandler, interpolate, Extrapolation,
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

interface OnboardingProps {
  onComplete: () => void;
}

// Componentes de ícono SVG — uno por slide
const IconRide = ({ color }: { color: string }) => (
  <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
    <Rect x="8" y="28" width="56" height="24" rx="8" fill={color} opacity={0.2} />
    <Path d="M12 40h48M20 52a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM52 52a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <Path d="M14 40l6-14h32l6 14" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconBid = ({ color }: { color: string }) => (
  <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
    <Circle cx="36" cy="36" r="24" fill={color} opacity={0.15} />
    <Path d="M36 18v36M24 28l12-10 12 10M28 44h16" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 36h28" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const IconSafe = ({ color }: { color: string }) => (
  <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
    <Path d="M36 12 L58 22 L58 42 Q58 56 36 62 Q14 56 14 42 L14 22 Z" fill={color} opacity={0.15} stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
    <Path d="M26 38l8 8 14-16" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconStart = ({ color }: { color: string }) => (
  <Svg width={72} height={72} viewBox="0 0 72 72" fill="none">
    <Circle cx="36" cy="36" r="16" fill={color} opacity={0.2} />
    <Circle cx="36" cy="36" r="6" fill={color} />
    <Path d="M36 14v6M36 52v6M14 36h6M52 36h6" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
  </Svg>
);

const SLIDES = [
  {
    Icon: IconRide,
    accentColor: '#F5C518',
    titleKey: 'onboarding.slide1Title',
    subtitleKey: 'onboarding.slide1Sub',
    defaults: { title: 'Bienvenido a B-Ride', sub: 'Tu viaje seguro y económico comienza aquí' },
  },
  {
    Icon: IconBid,
    accentColor: '#00D4C8',
    titleKey: 'onboarding.slide2Title',
    subtitleKey: 'onboarding.slide2Sub',
    defaults: { title: 'Negocia tu precio', sub: 'Los conductores compiten por tu viaje — tú decides cuánto pagar' },
  },
  {
    Icon: IconSafe,
    accentColor: '#FF5722',
    titleKey: 'onboarding.slide3Title',
    subtitleKey: 'onboarding.slide3Sub',
    defaults: { title: 'Viaja seguro', sub: 'Conductores verificados, botón SOS y seguimiento en tiempo real' },
  },
  {
    Icon: IconStart,
    accentColor: '#4CAF50',
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
            <View style={[styles.iconContainer, { backgroundColor: `${slide.accentColor}18` }]}>
              <slide.Icon color={slide.accentColor} />
            </View>
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
            style={[styles.dot, i === currentIndex && [styles.dotActive, { backgroundColor: SLIDES[currentIndex].accentColor }]]}
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
  iconContainer: {
    width: 120, height: 120,
    borderRadius: 60,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: theme.spacing?.xl || 32,
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.2)',
  },
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
