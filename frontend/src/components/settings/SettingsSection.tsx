import { useAppTheme } from '../../hooks/useAppTheme';
/**
 * SettingsSection — Card wrapper con header label para grupos de settings.
 *
 * Usage:
 *   <SettingsSection label="CUENTA">
 *     <SettingsItem ... />
 *     <SettingsItem ... />
 *   </SettingsSection>
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

interface SettingsSectionProps {
  label?: string;
  children: React.ReactNode;
  /** Sin card border — para secciones especiales como logout */
  flat?: boolean;
}

export default function SettingsSection({

  label,
  children,
  flat = false,
}: SettingsSectionProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.header}>{label.toUpperCase()}</Text>
      ) : null}
      <View style={[styles.card, flat && styles.cardFlat]}>{children}</View>
    </View>
  );
}

/** Divider for between items inside a section */
export function SectionDivider() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  return <View style={styles.divider} />;
}

const getStyles = (theme: any) => StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  header: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
    marginTop: 20,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardFlat: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginLeft: 58, // Aligned with text after icon
  },
});
