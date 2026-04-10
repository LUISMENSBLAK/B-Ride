import { useAppTheme } from '../hooks/useAppTheme';
/**
 * Loader — Indicador de carga animado y premium
 * No usa el ActivityIndicator básico de React Native.
 * Usa Reanimated para animar en UI thread.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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

interface LoaderProps {
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    color?: string;
}

function Dot({ delay, color }: { delay: number; color: string }) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => getStyles(theme), [theme]);
    const opacity = useSharedValue(0.3);
    const translateY = useSharedValue(0);

    useEffect(() => {

        opacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(1,   { duration: 320, easing: Easing.out(Easing.ease) }),
                    withTiming(0.3, { duration: 320, easing: Easing.in(Easing.ease)  })
                ),
                -1, // infinito
                false
            )
        );
        translateY.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(-6, { duration: 320, easing: Easing.out(Easing.ease) }),
                    withTiming(0,  { duration: 320, easing: Easing.in(Easing.ease)  })
                ),
                -1,
                false
            )
        );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity:   opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return <Animated.View style={[styles.dot, { backgroundColor: color }, animStyle]} />;
}

export default function Loader({
 label, size = 'md', color }: LoaderProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => getStyles(theme), [theme]);
    const dotColor = color ?? theme.colors.primary;
    const dotSize  = size === 'sm' ? 7 : size === 'md' ? 10 : 14;

    return (
        <View style={styles.container}>
            <View style={styles.dotsRow}>
                <Dot delay={0}   color={dotColor} />
                <Dot delay={150} color={dotColor} />
                <Dot delay={300} color={dotColor} />
            </View>
            {label && <Text style={styles.label}>{label}</Text>}
        </View>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    dotsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    label: {
        ...theme.typography.bodyMuted,
        textAlign: 'center',
    },
});
