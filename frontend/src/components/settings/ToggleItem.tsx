import React from 'react';
import { Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import SettingsItem from './SettingsItem';
import { useAppTheme } from '../../hooks/useAppTheme';

interface ToggleItemProps {
  icon?: React.ReactNode;
  label: string;
  value: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}

export default function ToggleItem({
  icon,
  label,
  value,
  onToggle,
  disabled = false,
}: ToggleItemProps) {
  const theme = useAppTheme();

  const handleToggle = (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle(next);
  };

  return (
    <SettingsItem
      icon={icon}
      label={label}
      disabled={disabled}
      rightElement={
        <Switch
          value={value}
          onValueChange={handleToggle}
          trackColor={{
            false: theme.wixarika.toggleInactive,
            true: theme.wixarika.toggleActive,
          }}
          thumbColor={theme.colors.text}
          ios_backgroundColor={theme.wixarika.toggleInactive}
          disabled={disabled}
        />
      }
    />
  );
}
