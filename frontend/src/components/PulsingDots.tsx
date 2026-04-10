import { useAppTheme } from '../hooks/useAppTheme';
/**
 * PulsingDots — 3 círculos animados tipo Uber para estados de carga.
 *
 * Cada dot pulsa en secuencia con:
 *  - scale (0.6 → 1.2 → 0.6)
 *  - opacity (0.3 → 1 → 0.3)
 *
 * Toda la animación corre en UI thread via Reanimated.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { theme } from '../theme';

interface PulsingDotsProps {
  /** Color de los dots (default: theme.colors.primary) */
  color?: string;
  /** Tamaño de cada dot en px (default: 12) */
  size?: number;
  /** Gap entre dots (default: 14) */
  gap?: number;
}

function Dot({
  delay,
  color,
  size,
}: {
  delay: number;
  color: string;
  size: number;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.3);

  useEffect(() => {

    const easeOut = Easing.out(Easing.ease);
    const easeIn = Easing.in(Easing.ease);

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.2, { duration: 400, easing: easeOut }),
          withTiming(0.6, { duration: 400, easing: easeIn })
        ),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: easeOut }),
          withTiming(0.3, { duration: 400, easing: easeIn })
        ),
        -1,
        false
      )
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animStyle,
      ]}
    />
  );
}

export default function PulsingDots({
  color,
  size = 12,
  gap = 14,
}: PulsingDotsProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const dotColor = color ?? theme.colors.primary;

  return (
    <View style={[styles.container, { gap }]}>
      <Dot delay={0} color={dotColor} size={size} />
      <Dot delay={160} color={dotColor} size={size} />
      <Dot delay={320} color={dotColor} size={size} />
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
