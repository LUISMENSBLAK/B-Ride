import { useAppTheme } from '../hooks/useAppTheme';
/**
 * Button — Componente base con scale animation en UI thread (Reanimated)
 * Variantes: primary | secondary | ghost | danger
 * Size: sm | md | lg
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { theme } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
    label: string;
    onPress: () => void;
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    style?: ViewStyle;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function Button({
    label,
    onPress,
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    fullWidth = false,
    style,
}: ButtonProps) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => getStyles(theme), [theme]);
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
    };

    const handlePressOut = () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    };

    const containerStyle = [
        styles.base,
        styles[`size_${size}`],
        styles[`variant_${variant}`],
        fullWidth && styles.fullWidth,
        (disabled || loading) && styles.disabled,
        style,
    ];

    return (
        <AnimatedTouchable
            style={[animStyle, containerStyle]}
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled || loading}
            activeOpacity={1}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === 'ghost' || variant === 'secondary' ? theme.colors.primary : theme.colors.primaryText}
                    size="small"
                />
            ) : (
                <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>
                    {label}
                </Text>
            )}
        </AnimatedTouchable>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    base: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.borderRadius.pill,
        flexDirection: 'row',
    },
    fullWidth: { width: '100%' },
    disabled: { opacity: 0.45 },

    // Sizes
    size_sm: { paddingVertical: 10, paddingHorizontal: 20, minHeight: 40 },
    size_md: { paddingVertical: 14, paddingHorizontal: 24, minHeight: 48 },
    size_lg: { paddingVertical: 16, paddingHorizontal: 32, minHeight: 52 },

    // Variants
    variant_primary: {
        backgroundColor: theme.colors.primary,
        ...theme.shadows.primary,
    },
    variant_secondary: {
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    variant_ghost: {
        backgroundColor: 'transparent',
    },
    variant_danger: {
        backgroundColor: theme.colors.error,
        ...theme.shadows.sm,
    },
    variant_success: {
        backgroundColor: theme.colors.success,
        ...theme.shadows.success,
    },

    // Labels base
    label: {
        ...theme.typography.button,
    },
    label_primary: { color: theme.colors.primaryText },
    label_secondary: { color: theme.colors.text },
    label_ghost: { color: theme.colors.primary },
    label_danger: { color: theme.colors.primaryText },
    label_success: { color: theme.colors.primaryText },

    // Label sizes
    labelSize_sm: { fontSize: 14 },
    labelSize_md: { fontSize: 16 },
    labelSize_lg: { fontSize: 18 },
});
