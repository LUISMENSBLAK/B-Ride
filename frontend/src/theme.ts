// ─────────────────────────────────────────────────────────────────
// B-Ride Design System — Theme Wixárika v3
// Identidad visual inspirada en la cosmovisión Wixárika.
// TODO el sistema visual sale de aquí. NO hay valores hardcodeados.
// ─────────────────────────────────────────────────────────────────

export const theme = {
    // ── COLORES (Dark — Noche de Sierra) ────────────────────────
    colors: {
        // Fondos
        background:      '#0D0520',   // Noche de sierra
        surface:         '#1A0A35',   // Morado profundo
        surfaceHigh:     '#241245',   // Cards, inputs
        overlay:         'rgba(5,2,15,0.80)',

        // Branding
        primary:         '#F5C518',   // Dorado maíz
        primaryDark:     '#D4A800',   // Dorado pressed
        primaryLight:    'rgba(245,197,24,0.18)',
        primaryText:     '#0D0520',   // Texto sobre botones primarios (oscuro sobre dorado)

        // Texto
        text:            '#FFFFFF',
        textSecondary:   '#C4B8E0',
        textMuted:       '#9A8EB8',   // FIX-M04: mejorado para ratio WCAG AA ≥4.5:1

        // Semánticos
        success:         '#00D4C8',   // Turquesa chaquira
        successLight:    'rgba(0,212,200,0.15)',
        warning:         '#F5C518',   // Dorado maíz
        warningLight:    'rgba(245,197,24,0.15)',
        error:           '#FF5722',   // Coral venado
        errorLight:      'rgba(255,87,34,0.15)',
        danger:          '#E53935',   // Rojo verdadero para acciones destructivas

        // UI
        border:          'rgba(245,197,24,0.20)',
        borderLight:     'rgba(255,255,255,0.06)',
        borderFocus:     'rgba(245,197,24,0.70)',
        inputBackground: '#1A0A35',
        inputPlaceholder:'#9A8EB8',
        link:            '#00D4C8',   // Turquesa

        // Herencia para compatibilidad hacia atrás
        inputPlaceholderColor: '#9A8EB8',
        primaryLight2:   'rgba(245,197,24,0.10)',

        // Colores extendidos Wixárika
        turquesa:        '#00D4C8',
        turquesaLight:   'rgba(0,212,200,0.15)',
        coral:           '#FF5722',
        coralLight:      'rgba(255,87,34,0.15)',
        verde:           '#4CAF50',
        verdeLight:      'rgba(76,175,80,0.15)',
        azulNierika:     '#3D8EF0',
        morado:          '#9C27B0',
        gradientWixarika: ['#FF5722', '#F5C518', '#00D4C8', '#4CAF50', '#9C27B0'] as readonly string[],
    },

    // ── WIXÁRIKA — Capa de Marca (invariante entre modos) ───────
    wixarika: {
        navActive:       '#F5C518',
        navInactive:     '#7B6B9A',
        navBackground:   '#0D0520',
        navDot:          '#F5C518',
        toggleActive:    '#F5C518',
        toggleInactive:  '#241245',
        settingsIcon:    '#F5C518',
        mapPinOrigen:    '#3D8EF0',
        mapPinDestino:   '#F5C518',
        mapRoute:        '#F5C518',
        paymentBadge:    '#F5C518',
        borderGradient:  ['#FF5722', '#F5C518', '#00D4C8', '#4CAF50', '#9C27B0'] as readonly string[],
    },

    // ── SPACING ──────────────────────────────────────────────────
    spacing: {
        xs:   4,
        s:    8,
        m:    16,
        l:    24,
        xl:   32,
        xxl:  48,
        xxxl: 64,
    },

    // ── BORDER RADIUS ────────────────────────────────────────────
    borderRadius: {
        s:    6,
        m:    12,
        l:    16,
        xl:   24,
        pill: 9999,
    },

    // ── TIPOGRAFÍA ───────────────────────────────────────────────
    typography: {
        display: {
            fontSize:      38,
            fontWeight:    '800' as const,
            color:         '#FFFFFF',
            letterSpacing: -1,
            lineHeight:    44,
        },
        header: {
            fontSize:      28,
            fontWeight:    '700' as const,
            color:         '#FFFFFF',
            letterSpacing: -0.5,
            lineHeight:    34,
        },
        title: {
            fontSize:      20,
            fontWeight:    '600' as const,
            color:         '#FFFFFF',
            lineHeight:    26,
        },
        body: {
            fontSize:   16,
            color:      '#FFFFFF',
            lineHeight: 24,
        },
        bodyMuted: {
            fontSize:   14,
            color:      '#C4B8E0',
            lineHeight: 20,
        },
        caption: {
            fontSize:      12,
            color:         '#7B6B9A',
            lineHeight:    16,
            letterSpacing: 0.2,
        },
        button: {
            fontSize:   16,
            fontWeight: '700' as const,
            color:      '#0D0520',   // Texto oscuro sobre botones dorados
            letterSpacing: 0.1,
        },
        label: {
            fontSize:      11,
            fontWeight:    '600' as const,
            color:         '#7B6B9A',
            letterSpacing: 0.8,
            textTransform: 'uppercase' as const,
        },
    },

    // ── SOMBRAS (sin negro en elementos de marca) ────────────────
    shadows: {
        sm: {
            shadowColor: 'rgba(13,5,32,0.6)',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 3,
        },
        md: {
            shadowColor: 'rgba(13,5,32,0.7)',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 8,
        },
        lg: {
            shadowColor: 'rgba(13,5,32,0.8)',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.5,
            shadowRadius: 24,
            elevation: 16,
        },
        primary: {
            shadowColor: '#F5C518',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 8,
        },
        success: {
            shadowColor: '#00D4C8',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 8,
        },
        error: {
            shadowColor: '#FF5722',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
            elevation: 8,
        },
    },

    // ── ANIMACIONES ──────────────────────────────────────────────
    animation: {
        fast:   200,
        normal: 300,
        slow:   400,
    },
};

// Tipo exportado para typesafety en componentes
export type Theme = typeof theme;

// Dark colors export
export const darkColors = theme.colors;

// ── LIGHT MODE — Wixárika Claro ─────────────────────────────────
export const lightColors: typeof darkColors = {
    background:      '#FFF8E7',    // Crema cálido
    surface:         '#FFFFFF',    // Superficies blancas
    surfaceHigh:     '#F3EAD7',    // Cards elevadas
    overlay:         'rgba(13,5,32,0.45)',

    primary:         '#F5C518',    // Dorado maíz (igual en ambos modos)
    primaryDark:     '#D4A800',
    primaryLight:    'rgba(245,197,24,0.15)',
    primaryText:     '#0D0520',    // Texto sobre dorado

    text:            '#0D0520',    // Texto principal oscuro
    textSecondary:   '#5E548E',    // Morado medio
    textMuted:       '#8E82B0',    // Morado claro

    success:         '#00B3A8',
    successLight:    'rgba(0,179,168,0.12)',
    warning:         '#D4A800',
    warningLight:    'rgba(212,168,0,0.12)',
    error:           '#E04420',
    errorLight:      'rgba(224,68,32,0.10)',
    danger:          '#C62828',   // Rojo verdadero para light mode

    border:          'rgba(13,5,32,0.10)',
    borderLight:     'rgba(13,5,32,0.04)',
    borderFocus:     'rgba(245,197,24,0.60)',
    inputBackground: '#FFFFFF',
    inputPlaceholder:'#8E82B0',
    link:            '#00B3A8',

    inputPlaceholderColor: '#8E82B0',
    primaryLight2:   'rgba(245,197,24,0.08)',

    // Colores extendidos (mismos en ambos modos)
    turquesa:        '#00D4C8',
    turquesaLight:   'rgba(0,212,200,0.12)',
    coral:           '#FF5722',
    coralLight:      'rgba(255,87,34,0.10)',
    verde:           '#4CAF50',
    verdeLight:      'rgba(76,175,80,0.10)',
    azulNierika:     '#3D8EF0',
    morado:          '#9C27B0',
    gradientWixarika: ['#FF5722', '#F5C518', '#00D4C8', '#4CAF50', '#9C27B0'] as readonly string[],
};
