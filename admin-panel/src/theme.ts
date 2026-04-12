// B-Ride Admin Panel — Design Tokens
// Matches frontend/src/theme.ts palette exactly

export const theme = {
  colors: {
    background: '#0D0520',
    surface: '#1A0A35',
    surfaceAlt: '#22104A',
    surfaceHover: '#2A1560',
    border: '#2E1A5A',
    borderLight: '#3D2478',

    gold: '#F5C518',
    goldDark: '#D4A800',
    goldLight: '#FFD740',
    goldGlow: 'rgba(245, 197, 24, 0.15)',

    text: '#FFFFFF',
    textSecondary: '#A89BC2',
    textMuted: '#6B5C8A',

    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.12)',
    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.12)',
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.12)',
    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.12)',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  shadow: {
    card: '0 4px 24px rgba(0,0,0,0.35)',
    glow: '0 0 20px rgba(245, 197, 24, 0.2)',
    sidebar: '4px 0 24px rgba(0,0,0,0.5)',
  },
  font: {
    sans: "'Inter', sans-serif",
  },
};

export default theme;
