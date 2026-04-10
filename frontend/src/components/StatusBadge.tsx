import { useAppTheme } from '../hooks/useAppTheme';
/**
 * StatusBadge — Indicador visual de estado del sistema
 * Variantes mapeadas al RideStatus del store + estados del driver
 */
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

type BadgeVariant = 
    | 'idle'
    | 'searching'
    | 'negotiating'
    | 'active'
    | 'completed'
    | 'online'
    | 'offline'
    | 'warning';

interface BadgeProps {
    variant: BadgeVariant;
    label?: string;
    style?: ViewStyle;
}

function useBadgeConfig() {
    const theme = useAppTheme();
    return {
        idle:        { bg: theme.colors.surfaceHigh,  text: theme.colors.textSecondary, dot: theme.colors.textMuted,     defaultLabel: 'Disponible'   },
        searching:   { bg: theme.colors.warningLight,  text: theme.colors.warning,       dot: theme.colors.warning,       defaultLabel: 'Buscando...'  },
        negotiating: { bg: theme.colors.primaryLight,  text: theme.colors.primary,       dot: theme.colors.primary,       defaultLabel: 'Ofertas'      },
        active:      { bg: theme.colors.successLight,  text: theme.colors.success,       dot: theme.colors.success,       defaultLabel: 'En Viaje'     },
        completed:   { bg: theme.colors.primaryLight,  text: theme.colors.primary,       dot: theme.colors.primary,       defaultLabel: 'Completado'   },
        online:      { bg: theme.colors.successLight,  text: theme.colors.success,       dot: theme.colors.success,       defaultLabel: 'En Línea'     },
        offline:     { bg: theme.colors.surfaceHigh,   text: theme.colors.textMuted,     dot: theme.colors.textMuted,     defaultLabel: 'Offline'      },
        warning:     { bg: theme.colors.warningLight,  text: theme.colors.warning,       dot: theme.colors.warning,       defaultLabel: 'Atención'     },
    } as const;
}

export default function StatusBadge({ variant, label, style }: BadgeProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const badgeConfig = useBadgeConfig();
  const config = badgeConfig[variant];

    return (
        <View style={[styles.badge, { backgroundColor: config.bg }, style]}>
            <View style={[styles.dot, { backgroundColor: config.dot }]} />
            <Text style={[styles.label, { color: config.text }]}>
                {label ?? config.defaultLabel}
            </Text>
        </View>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    badge: {
        flexDirection:  'row',
        alignItems:     'center',
        paddingVertical:  5,
        paddingHorizontal: 10,
        borderRadius:   theme.borderRadius.pill,
        gap: 6,
        alignSelf: 'flex-start',
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    label: {
        fontSize:   12,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
});
