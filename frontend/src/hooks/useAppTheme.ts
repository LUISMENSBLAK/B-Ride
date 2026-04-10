import { useSettings } from './useSettings';
import { theme, lightColors, darkColors } from '../theme';

export function useAppTheme() {
    const darkMode = useSettings((state) => state.darkMode);
    const colors = darkMode ? darkColors : lightColors;

    // Rebuild typography using active palette so text is always readable
    const typography = {
        display:  { ...theme.typography.display,  color: colors.text },
        header:   { ...theme.typography.header,   color: colors.text },
        title:    { ...theme.typography.title,     color: colors.text },
        body:     { ...theme.typography.body,      color: colors.text },
        bodyMuted:{ ...theme.typography.bodyMuted, color: colors.textSecondary },
        caption:  { ...theme.typography.caption,   color: colors.textMuted },
        button:   { ...theme.typography.button,    color: colors.primaryText },
        label:    { ...theme.typography.label,     color: colors.textMuted },
    };

    // Light-mode shadows are softer
    const shadows = darkMode ? theme.shadows : {
        ...theme.shadows,
        sm: { ...theme.shadows.sm, shadowOpacity: 0.12, shadowColor: 'rgba(13,5,32,0.3)' },
        md: { ...theme.shadows.md, shadowOpacity: 0.15, shadowColor: 'rgba(13,5,32,0.25)' },
        lg: { ...theme.shadows.lg, shadowOpacity: 0.18, shadowColor: 'rgba(13,5,32,0.2)' },
        primary: { ...theme.shadows.primary, shadowOpacity: 0.25 },
        success: { ...theme.shadows.success, shadowOpacity: 0.25 },
        error:   { ...theme.shadows.error,   shadowOpacity: 0.25 },
    };

    return {
        ...theme,
        colors,
        typography,
        shadows,
        // wixarika is brand layer — NEVER changes between modes
        wixarika: theme.wixarika,
        isDark: darkMode,
    };
}
