import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Circle, G } from 'react-native-svg';
import { theme } from '../theme';

interface CarMarkerProps {
    heading?: number;
    size?: number;
}

const CarMarker = ({ heading = 0, size = 28 }: CarMarkerProps) => (
  <View style={{
    width: size,
    height: size * 1.6,
    transform: [{ rotate: `${heading}deg` }],
    alignItems: 'center',
    justifyContent: 'center',
  }}>
    <Svg
      width={size}
      height={size * 1.6}
      viewBox="0 0 44 72"
    >
      {/* Sombra */}
      <G opacity={0.3}>
        <Rect x="6" y="60" width="32" height="8" rx="4" fill="#000000" />
      </G>

      {/* Cuerpo principal del auto */}
      <Rect x="4" y="12" width="36" height="48" rx="8" fill={theme.colors.primary} />

      {/* Techo / cabina */}
      <Rect x="9" y="18" width="26" height="28" rx="6" fill={theme.colors.primaryDark} />

      {/* Parabrisas delantero */}
      <Rect x="11" y="20" width="22" height="12" rx="3" fill={theme.colors.surface} opacity="0.85" />

      {/* Parabrisas trasero */}
      <Rect x="11" y="36" width="22" height="10" rx="3" fill={theme.colors.surface} opacity="0.70" />

      {/* Llanta delantera izquierda */}
      <Rect x="0" y="14" width="8" height="14" rx="4" fill={theme.colors.background} />
      <Rect x="1" y="16" width="6" height="10" rx="3" fill={theme.colors.surfaceHigh} />

      {/* Llanta delantera derecha */}
      <Rect x="36" y="14" width="8" height="14" rx="4" fill={theme.colors.background} />
      <Rect x="37" y="16" width="6" height="10" rx="3" fill={theme.colors.surfaceHigh} />

      {/* Llanta trasera izquierda */}
      <Rect x="0" y="42" width="8" height="14" rx="4" fill={theme.colors.background} />
      <Rect x="1" y="44" width="6" height="10" rx="3" fill={theme.colors.surfaceHigh} />

      {/* Llanta trasera derecha */}
      <Rect x="36" y="42" width="8" height="14" rx="4" fill={theme.colors.background} />
      <Rect x="37" y="44" width="6" height="10" rx="3" fill={theme.colors.surfaceHigh} />

      {/* Faros delanteros */}
      <Circle cx="13" cy="13" r="3" fill={theme.colors.text} opacity="0.95" />
      <Circle cx="31" cy="13" r="3" fill={theme.colors.text} opacity="0.95" />

      {/* Faros traseros */}
      <Circle cx="13" cy="59" r="3" fill={theme.colors.error} opacity="0.90" />
      <Circle cx="31" cy="59" r="3" fill={theme.colors.error} opacity="0.90" />

      {/* Detalle central — emblema B-Ride */}
      <Circle cx="22" cy="30" r="4" fill={theme.colors.background} />
      <Circle cx="22" cy="30" r="2.5" fill={theme.colors.primary} />
    </Svg>
  </View>
);

export default CarMarker;
