import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withSequence } from 'react-native-reanimated';
import { theme } from '../theme';

const PassengerLocationMarker = () => {
    const scale = useSharedValue(1);

    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.4, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                withTiming(1.0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            true
        );
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
        };
    });

    return (
        <View style={{
            width: 32, height: 32,
            alignItems: 'center', justifyContent: 'center'
        }}>
            {/* Anillo exterior pulsante — se anima con Animated.View */}
            <Animated.View style={[{
                position: 'absolute',
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: 'rgba(61,142,240,0.20)',
                borderWidth: 1.5,
                borderColor: 'rgba(61,142,240,0.50)',
            }, animatedStyle]} />
            
            {/* Anillo medio */}
            <View style={{
                position: 'absolute',
                width: 20, height: 20, borderRadius: 10,
                backgroundColor: 'rgba(61,142,240,0.30)',
            }} />
            
            {/* Punto central sólido */}
            <View style={{
                width: 12, height: 12, borderRadius: 6,
                backgroundColor: theme.colors.azulNierika,
                borderWidth: 2.5,
                borderColor: theme.colors.text,
                shadowColor: theme.colors.azulNierika,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
                elevation: 8,
            }} />
        </View>
    );
};

export default PassengerLocationMarker;
