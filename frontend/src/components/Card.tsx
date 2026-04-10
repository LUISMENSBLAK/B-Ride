import { useAppTheme } from '../hooks/useAppTheme';
/**
 * AnimatedCard — Contenedor con fade+scale de entrada
 * Se usa como wrapper de secciones del BottomSheet para
 * transiciones suaves entre estados (no saltos bruscos).
 */
import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    animateIn?: boolean; // true = anima al montar
    elevated?: boolean;  // sombra más pronunciada
}

export default function Card({
 children, style, animateIn = true, elevated = false }: CardProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

    const opacity    = useSharedValue(animateIn ? 0 : 1);
    const translateY = useSharedValue(animateIn ? 16 : 0);

    useEffect(() => {
        if (animateIn) {
            opacity.value    = withTiming(1,  { duration: 280 });
            translateY.value = withSpring(0,  { damping: 18, stiffness: 180 });
        }
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        opacity:   opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View
            style={[
                styles.card,
                elevated && styles.elevated,
                animStyle,
                style,
            ]}
        >
            {children}
        </Animated.View>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    card: {
        backgroundColor:  theme.colors.surface,
        borderRadius:     theme.borderRadius.l,
        padding:          theme.spacing.l,
        borderWidth:      1,
        borderColor:      theme.colors.border,
    },
    elevated: {
        ...theme.shadows.md,
        borderColor: theme.colors.borderLight,
    },
});
