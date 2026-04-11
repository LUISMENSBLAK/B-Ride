import { useAppTheme } from '../../hooks/useAppTheme';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { useAuthStore } from '../../store/authStore';
import { theme } from '../../theme';
import { useTranslation } from '../../hooks/useTranslation';
import client from '../../api/client';
import { useCurrency } from '../../hooks/useCurrency';

export default function EarningsScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();

  // BUG 16 FIX: Estado real en vez de hardcodeado
  const [todayStats, setTodayStats] = useState({ trips: 0, earned: 0.00, rating: user?.avgRating ?? 5.0 });
  const [weekTrips, setWeekTrips] = useState(0);
  const [monthTrips, setMonthTrips] = useState(0);

  // BUG 16 FIX: Fetch real de ganancias desde el backend
  useEffect(() => {
    const fetchEarnings = async () => {
      try {
        const res = await client.get('/rides/history');
        if (res.data?.success) {
          const allRides = res.data.data || [];
          const completed = allRides.filter((r: any) => r.status === 'COMPLETED');

          const now = new Date();
          const todayStr = now.toDateString();

          // Viajes de hoy
          const todayRides = completed.filter((r: any) => {
            return new Date(r.createdAt).toDateString() === todayStr;
          });

          // Ganancias de hoy (80% del precio del bid aceptado o propuesto)
          const earned = todayRides.reduce((sum: number, r: any) => {
            const bid = r.bids?.find((b: any) => b.status === 'ACCEPTED');
            return sum + (bid?.price ?? r.proposedPrice ?? 0) * 0.80;
          }, 0);

          setTodayStats({
            trips: todayRides.length,
            earned: Number(earned.toFixed(2)),
            rating: user?.avgRating ?? 5.0,
          });

          // Viajes de la semana (últimos 7 días)
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          setWeekTrips(completed.filter((r: any) => new Date(r.createdAt) >= weekAgo).length);

          // Viajes del mes (últimos 30 días)
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          setMonthTrips(completed.filter((r: any) => new Date(r.createdAt) >= monthAgo).length);
        }
      } catch (e) {
        console.error('[EarningsScreen] Error fetching earnings:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchEarnings();
  }, []);

  // Skeleton Animation
  const opacity = useSharedValue(0.4);
  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(0.8, { duration: 800 }), withTiming(0.4, { duration: 800 })),
      -1, true
    );
  }, []);
  const skeletonAnim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View style={[styles.skeletonHeader, skeletonAnim]} />
          <Animated.View style={[styles.skeletonCard, skeletonAnim]} />
          <View style={styles.statsRow}>
            <Animated.View style={[styles.skeletonBox, skeletonAnim]} />
            <Animated.View style={[styles.skeletonBox, skeletonAnim]} />
            <Animated.View style={[styles.skeletonBox, skeletonAnim]} />
          </View>
        </View>
      </View>
    );
  }

  const hasEarnings = todayStats.trips > 0 || weekTrips > 0 || monthTrips > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('driver.earningsTitle')}</Text>
      </View>

      {/* Card principal */}
      <View style={styles.earningsCard}>
        <Text style={styles.cardLabel}>{t('driver.earningsToday')}</Text>
        <Text style={styles.earningsAmount}>{formatPrice(todayStats.earned)}</Text>
        <Text style={styles.cardSub}>
          {todayStats.trips === 1 
            ? t('driver.tripsCompleted_one', { count: 1 }) 
            : t('driver.tripsCompleted_other', { count: todayStats.trips })}
        </Text>
      </View>

      {/* Stats secundarios */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>⭐ {todayStats.rating.toFixed(1)}</Text>
          <Text style={styles.statLabel}>{t('driver.earningsRating')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{weekTrips}</Text>
          <Text style={styles.statLabel}>{t('driver.earningsWeek')}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{monthTrips}</Text>
          <Text style={styles.statLabel}>{t('driver.earningsMonth')}</Text>
        </View>
      </View>

      {!hasEarnings && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyTitle}>{t('driver.earningsEmptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('driver.earningsEmptySubtitle')}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { ...theme.typography.header, fontSize: 26 },
  earningsCard: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...theme.shadows.primary,
  },
  cardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  earningsAmount: { fontSize: 48, fontWeight: '800', color: theme.colors.primaryText, letterSpacing: -1, marginBottom: 4 },
  cardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statValue: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  statLabel: { ...theme.typography.bodyMuted, fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...theme.typography.title, marginBottom: 8 },
  emptyText: { ...theme.typography.bodyMuted, textAlign: 'center', paddingHorizontal: 32 },
  
  // Skeleton Styles
  skeletonHeader: { width: 180, height: 32, backgroundColor: theme.colors.surfaceHigh, borderRadius: 8, marginBottom: 24 },
  skeletonCard: { width: '100%', height: 160, backgroundColor: theme.colors.surfaceHigh, borderRadius: 16, marginBottom: 20 },
  skeletonBox: { flex: 1, height: 80, backgroundColor: theme.colors.surfaceHigh, borderRadius: 16 },
});
