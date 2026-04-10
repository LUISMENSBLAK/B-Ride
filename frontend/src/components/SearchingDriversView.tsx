import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { SharedValue, useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withDelay } from 'react-native-reanimated';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';

interface SearchingDriversViewProps {
  onCancel: () => void;
  activeDriversCount: number;
}

const SearchingDriversView = ({ onCancel, activeDriversCount }: SearchingDriversViewProps) => {
  const theme = useAppTheme();
  const { t } = useTranslation();
  
  // Timer de 3 minutos
  const [timeLeft, setTimeLeft] = useState(180);
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeString = `${mins}:${secs.toString().padStart(2, '0')}`;

  // Animaciones de radar/pulso (3 anillos)
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);

  useEffect(() => {
    ring1.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
    ring2.value = withDelay(600, withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false));
    ring3.value = withDelay(1200, withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false));
  }, []);

  const getRingStyle = (ring: SharedValue<number>) => useAnimatedStyle(() => ({
    opacity: 1 - ring.value,
    transform: [{ scale: 1 + ring.value * 2 }],
  }));

  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const hasDrivers = activeDriversCount > 0;

  return (
    <View style={styles.container}>
      <View style={styles.radarContainer}>
        {hasDrivers && (
          <>
            <Animated.View style={[styles.ring, getRingStyle(ring3)]} />
            <Animated.View style={[styles.ring, getRingStyle(ring2)]} />
            <Animated.View style={[styles.ring, getRingStyle(ring1)]} />
          </>
        )}
        <View style={styles.centerDot} />
      </View>
      
      <Text style={styles.title}>
        {hasDrivers ? t('driver.searching') : t('driver.noDriversAvailable')}
      </Text>
      
      <Text style={styles.subtitle}>
        {hasDrivers 
          ? `${activeDriversCount} conductores activos en tu zona`
          : t('driver.noDriversAvailableSubtitle')}
      </Text>
      
      {hasDrivers && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{timeString}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>{t('searching.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  radarContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  ring: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  centerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.primary,
  },
  title: {
    ...theme.typography.title,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    ...theme.typography.bodyMuted,
    marginBottom: theme.spacing.l,
    textAlign: 'center',
  },
  timerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryLight,
    marginBottom: theme.spacing.xl,
  },
  timerText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  cancelBtn: {
    padding: theme.spacing.m,
  },
  cancelText: {
    color: theme.colors.textMuted,
    fontWeight: '600',
    ...theme.typography.body,
  },
});

export default SearchingDriversView;
