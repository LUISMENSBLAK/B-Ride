import { useAppTheme } from '../../hooks/useAppTheme';
/**
 * SettingsItem — Row item reusable estilo iOS/Uber para SettingsScreen.
 *
 * Props:
 *  - icon: emoji o componente
 *  - label: texto principal
 *  - value: texto secundario (derecha)
 *  - onPress: callback (auto-agrega chevron)
 *  - rightElement: componente custom (Switch, etc.)
 *  - destructive: estilo rojo
 */
import React from 'react';
import { Text, StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { theme } from '../../theme';

interface SettingsItemProps {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

export default function SettingsItem({

  icon,
  label,
  value,
  onPress,
  rightElement,
  destructive = false,
  disabled = false,
}: SettingsItemProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={[styles.row, disabled && styles.rowDisabled]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || !onPress}
      >
        {/* Icon */}
        {icon ? <View style={styles.iconContainer}>{icon}</View> : null}

        {/* Label */}
        <Text
          style={[
            styles.label,
            destructive && styles.labelDestructive,
            disabled && styles.labelDisabled,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>

        {/* Right side */}
        <View style={styles.rightSide}>
          {value ? <Text style={styles.value}>{value}</Text> : null}
          {rightElement}
          {onPress && !rightElement ? (
            <Text style={styles.chevron}>›</Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  iconContainer: {
    marginRight: 14,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.text,
  },
  labelDestructive: {
    color: theme.colors.danger,
    fontWeight: '600',
  },
  labelDisabled: {
    color: theme.colors.textMuted,
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 12,
  },
  value: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  chevron: {
    color: theme.colors.primary,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '400',
  },
});
