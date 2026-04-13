import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withDelay,
} from 'react-native-reanimated';

interface Props { color: string; delay?: number; size?: number; }

export default function PulsingDot({ color, delay = 0, size = 8 }: Props) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(
      withSequence(withTiming(1, { duration: 500 }), withTiming(0.6, { duration: 500 })),
      -1, true
    ));
    opacity.value = withDelay(delay, withRepeat(
      withSequence(withTiming(1, { duration: 500 }), withTiming(0.4, { duration: 500 })),
      -1, true
    ));
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, marginHorizontal: 4,
    }, animStyle]} />
  );
}
