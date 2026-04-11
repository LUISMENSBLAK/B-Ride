/**
 * BidCard — Tarjeta de oferta del conductor.
 * v2: Timer regresivo de 25s visible para el pasajero.
 * Si el tiempo expira, la card se desactiva visualmente (no la elimina,
 * eso lo hace el backend vía socket).
 */
import React, { memo, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Animated, {
  FadeInDown, Layout,
  useSharedValue, useAnimatedStyle, withTiming, interpolateColor,
} from 'react-native-reanimated';
import { useAppTheme } from '../hooks/useAppTheme';
import { type Theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';

const BID_TTL_SECONDS = 25;

interface BidCardProps {
  bid: any;
  isBest: boolean;
  onAccept: (bidId: string, driverId: string) => void;
  pickupLat?: number;
  pickupLng?: number;
}

const StarRating = memo(({ rating, size = 12 }: { rating: number; size?: number }) => {
  const theme = useAppTheme();
  const full = Math.floor(rating);
  const half = rating - full >= 0.3;
  return (
    <Text style={{ fontSize: size, color: theme.colors.primary, letterSpacing: -1 }}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      {'☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}
    </Text>
  );
});

const BidCard = memo(({ bid, isBest, onAccept }: BidCardProps) => {
  const { t } = useTranslation();
  const driverName: string = bid.driver?.name ?? t('auth.roleDriver');
  const initial = driverName.charAt(0).toUpperCase();
  const avgRating: number = bid.driver?.avgRating ?? 0;
  const totalRatings: number = bid.driver?.totalRatings ?? 0;

  // V3: Info del vehículo si está disponible
  const vehicle = bid.driver?.vehicle;
  const vehicleInfo = vehicle?.make
    ? `${vehicle.color || ''} ${vehicle.make} ${vehicle.model || ''} • ${vehicle.plate || ''}`.trim()
    : null;

  // ── WEEK 1 FIX: Timer basado en createdAt del servidor ───────────────────
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (bid.createdAt) {
      const elapsed = Math.floor((Date.now() - new Date(bid.createdAt).getTime()) / 1000);
      return Math.max(0, BID_TTL_SECONDS - elapsed);
    }
    return BID_TTL_SECONDS;
  });
  const expired = secondsLeft <= 0;

  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(id);
  }, [expired]);

  const theme = useAppTheme();
  const bidStyles = React.useMemo(() => getBidStyles(theme), [theme]);

  // Barra de progreso animada
  const progress = useSharedValue(secondsLeft / BID_TTL_SECONDS);
  useEffect(() => {
    progress.value = withTiming(0, { duration: secondsLeft * 1000 });
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%` as any,
    backgroundColor: interpolateColor(
      progress.value,
      [0, 0.3, 1],
      [theme.colors.error, theme.colors.warning, theme.colors.success]
    ),
  }));

  const urgentText = secondsLeft <= 8;

  // P1: Indicador de surge si existe
  const surgeMultiplier = bid.surgeMultiplier;

  return (
    <Animated.View
      entering={FadeInDown.duration(350).springify()}
      layout={Layout.springify()}
      style={[bidStyles.card, isBest && bidStyles.bestCard, expired && bidStyles.cardExpired]}
    >
      {isBest && !expired && (
        <View style={bidStyles.bestBadge}>
          <Text style={bidStyles.bestBadgeText}>✦ Mejor Oferta</Text>
        </View>
      )}

      {/* P1: Badge de surge */}
      {surgeMultiplier && surgeMultiplier > 1 && (
        <View style={bidStyles.surgeBadge}>
          <Text style={bidStyles.surgeBadgeText}>⚡ {surgeMultiplier.toFixed(1)}x</Text>
        </View>
      )}

      {/* ── Barra de tiempo ── */}
      <View style={bidStyles.timerTrack}>
        <Animated.View style={[bidStyles.timerBar, barStyle]} />
      </View>
      <Text style={[bidStyles.timerLabel, urgentText && bidStyles.timerLabelUrgent]}>
        {expired ? 'Oferta expirada' : `Expira en ${secondsLeft}s`}
      </Text>

      <View style={bidStyles.row}>
        {/* Avatar */}
        <View style={[bidStyles.avatar, isBest && !expired && bidStyles.avatarBest]}>
          <Text style={bidStyles.avatarText}>{initial}</Text>
        </View>

        {/* Info conductor + V3: vehículo */}
        <View style={bidStyles.info}>
          <Text style={bidStyles.driverName}>{driverName}</Text>
          <View style={bidStyles.ratingRow}>
            <StarRating rating={avgRating} size={13} />
            <Text style={bidStyles.ratingValue}>
              {avgRating > 0 ? ` ${avgRating.toFixed(1)}` : ' Nuevo'}
              {totalRatings > 0 ? ` (${totalRatings})` : ''}
            </Text>
          </View>
          {/* V3: Info de vehículo */}
          {vehicleInfo && (
            <Text style={bidStyles.vehicleInfo} numberOfLines={1}>🚗 {vehicleInfo}</Text>
          )}
        </View>

        {/* Precio + botón */}
        <View style={bidStyles.priceCol}>
          <Text style={[bidStyles.price, isBest && !expired && bidStyles.priceBest]}>
            ${bid.price}
          </Text>
          {!expired ? (
            <TouchableOpacity
              style={[
                bidStyles.acceptBtn,
                isBest && bidStyles.acceptBtnBest,
                bid.isProcessing && bidStyles.acceptBtnDisabled,
              ]}
              onPress={() => onAccept(bid._id, bid.driver._id)}
              disabled={bid.isProcessing || expired}
            >
              {bid.isProcessing ? (
                <ActivityIndicator size="small" color={theme.colors.primaryText} />
              ) : (
                <Text style={bidStyles.acceptBtnText}>{t('driver.accept')}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={bidStyles.expiredLabel}>
              <Text style={bidStyles.expiredLabelText}>{t('bids.expired')}</Text>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
});

const getBidStyles = (theme: Theme) => StyleSheet.create({
  card: {
    backgroundColor:  theme.colors.surface,
    borderRadius:     theme.borderRadius.l,
    padding:          theme.spacing.m,
    marginBottom:     theme.spacing.m,
    borderWidth:      1,
    borderColor:      theme.colors.border,
    ...theme.shadows.sm,
  },
  bestCard: {
    borderColor:      theme.colors.primary,
    borderWidth:      2,
    backgroundColor:  theme.colors.primaryLight,
  },
  cardExpired: {
    opacity:          0.5,
    borderColor:      theme.colors.border,
  },
  bestBadge: {
    alignSelf:        'flex-start',
    backgroundColor:  theme.colors.primary,
    borderRadius:     theme.borderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical:  3,
    marginBottom:     8,
  },
  bestBadgeText: {
    color:            theme.colors.primaryText,
    fontSize:         11,
    fontWeight:       '700',
    letterSpacing:    0.3,
  },
  // ── Timer ─────────────────────────────────────────────────────────────────
  timerTrack: {
    height:           3,
    backgroundColor:  theme.colors.border,
    borderRadius:     2,
    overflow:         'hidden',
    marginBottom:     4,
  },
  timerBar: {
    height:           3,
    borderRadius:     2,
  },
  timerLabel: {
    ...theme.typography.caption,
    color:            theme.colors.textMuted,
    marginBottom:     8,
  },
  timerLabelUrgent: {
    color:            theme.colors.error,
    fontWeight:       '700' as const,
  },
  // ── Body ──────────────────────────────────────────────────────────────────
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
  },
  avatar: {
    width:            42,
    height:           42,
    borderRadius:     21,
    backgroundColor:  theme.colors.surfaceHigh,
    justifyContent:   'center',
    alignItems:       'center',
  },
  avatarBest: { backgroundColor: theme.colors.primary },
  avatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.primaryText },
  info: { flex: 1 },
  driverName: {
    ...theme.typography.body,
    fontWeight:       '600',
    fontSize:         15,
    marginBottom:     2,
  },
  ratingRow: {
    flexDirection:    'row',
    alignItems:       'center',
    marginBottom:     2,
  },
  ratingValue: {
    ...theme.typography.bodyMuted,
    fontSize:         12,
    marginLeft:       2,
  },
  priceCol: {
    alignItems:       'flex-end',
    gap:              6,
  },
  price: {
    fontSize:         22,
    fontWeight:       '700',
    color:            theme.colors.success,
  },
  priceBest: { color: theme.colors.primary },
  acceptBtn: {
    backgroundColor:  theme.colors.text,
    paddingVertical:  10,
    paddingHorizontal: 20,
    borderRadius:     theme.borderRadius.pill,
    minWidth:         90,
    alignItems:       'center',
  },
  acceptBtnDisabled: { opacity: 0.7 },
  acceptBtnBest: {
    backgroundColor:  theme.colors.primary,
    ...theme.shadows.primary,
  },
  acceptBtnText: { color: theme.colors.primaryText, fontSize: 14, fontWeight: '800' },
  expiredLabel: {
    paddingVertical:  8,
    paddingHorizontal: 14,
    borderRadius:     theme.borderRadius.pill,
    backgroundColor:  theme.colors.surfaceHigh,
    borderWidth:      1,
    borderColor:      theme.colors.border,
  },
  expiredLabelText: {
    ...theme.typography.caption,
    color:            theme.colors.textMuted,
    fontWeight:       '600',
  },
  // V3: Info de vehículo
  vehicleInfo: {
    ...theme.typography.caption,
    color:            theme.colors.textMuted,
    fontSize:         11,
    marginTop:        2,
  },
  // P1: Surge badge
  surgeBadge: {
    alignSelf:        'flex-start',
    backgroundColor:  theme.colors.warning,
    borderRadius:     theme.borderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical:  2,
    marginBottom:     4,
  },
  surgeBadgeText: {
    color:            '#000',
    fontSize:         11,
    fontWeight:       '800',
  },
});

export default BidCard;
