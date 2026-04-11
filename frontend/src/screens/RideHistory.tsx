import { useAppTheme } from '../hooks/useAppTheme';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList,
  StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import Loader from '../components/Loader';
import SkeletonLoader from '../components/SkeletonLoader';
import { useTranslation } from '../hooks/useTranslation';

export default function RideHistory() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { user } = useAuthStore();
  const { t, lang } = useTranslation();

  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    COMPLETED:   { label: t('history.status.completed'),  color: theme.colors.success,     bg: theme.colors.successLight },
    CANCELLED:   { label: t('history.status.cancelled'),   color: theme.colors.error,       bg: theme.colors.errorLight },
    IN_PROGRESS: { label: t('history.status.inProgress'),    color: theme.colors.primary,     bg: theme.colors.primaryLight },
    ACCEPTED:    { label: t('history.status.accepted'),    color: theme.colors.primary,     bg: theme.colors.primaryLight },
    NEGOTIATING: { label: t('history.status.negotiating'), color: theme.colors.warning,      bg: theme.colors.warningLight },
    REQUESTED:   { label: t('history.status.requested'),  color: theme.colors.textMuted,   bg: theme.colors.surface },
  };

  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0); // trigger re-fetch

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await client.get('/rides/history');
        if (res.data.success) {
          setRides(res.data.data);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Error al obtener historial');
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [retryCount]);

  const renderItem = ({ item }: { item: any }) => {
    // Precio final: bid aceptado o precio propuesto original
    let displayPrice = item.proposedPrice;
    if (item.bids && item.bids.length > 0) {
      const acceptedBid = item.bids.find((b: any) => b.status === 'ACCEPTED');
      if (acceptedBid) displayPrice = acceptedBid.price;
    }

    const isPassenger = user?.role !== 'DRIVER';
    const otherPartyLabel = isPassenger ? 'Conductor' : 'Pasajero';
    const otherPartyName = isPassenger
      ? (item.driver?.name ?? 'Sin asignar')
      : (item.passenger?.name ?? 'Desconocido');

    const statusCfg = STATUS_CONFIG[item.status] ?? {
      label: item.status,
      color: theme.colors.textMuted,
      bg: theme.colors.surface,
    };

    const formattedDate = new Date(item.createdAt).toLocaleDateString(lang, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <View style={styles.card}>
        {/* Header de la card */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
          <Text style={styles.price}>${displayPrice}</Text>
        </View>

        {/* Ruta: origen → destino */}
        <View style={styles.routeContainer}>
          <View style={styles.routeDots}>
            <View style={styles.pickupDot} />
            <View style={styles.routeLine} />
            <View style={styles.dropoffDot} />
          </View>
          <View style={styles.routeTexts}>
            <Text style={styles.routeLabel}>{t('history.origin')}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickupLocation?.address ?? '—'}
            </Text>
            <View style={styles.routeSpacer} />
            <Text style={styles.routeLabel}>{t('history.destination')}</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoffLocation?.address ?? '—'}
            </Text>
          </View>
        </View>

        {/* Footer: conductor/pasajero + fecha */}
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>
            <Text style={styles.footerLabel}>{otherPartyLabel}: </Text>
            {otherPartyName}
          </Text>
          <Text style={styles.dateText}>{formattedDate}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('history.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('history.loading')}</Text>
        </View>
        <View style={styles.listContent}>
            {[1, 2, 3, 4].map(i => (
                <View key={i} style={styles.skeletonCard}>
                    <View style={styles.skeletonHeaderRow}>
                       <SkeletonLoader width={80} height={24} borderRadius={12} />
                       <SkeletonLoader width={60} height={24} borderRadius={4} />
                    </View>
                    <SkeletonLoader width="100%" height={48} borderRadius={8} style={{ marginBottom: 24 }} />
                    <SkeletonLoader width="60%" height={16} borderRadius={4} />
                </View>
            ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryBtnText}>{t('history.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('history.title')}</Text>
        <Text style={styles.headerSubtitle}>
          {rides.length === 1 ? t('history.totalRides_one', { count: 1 }) : t('history.totalRides_other', { count: rides.length })}
        </Text>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🚗</Text>
            <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
            <Text style={styles.emptySubtitle}>{t('history.emptySubtitle')}</Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: theme.spacing.l,
    paddingBottom: theme.spacing.l,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    ...theme.typography.header,
    fontSize: 28,
  },
  headerSubtitle: {
    ...theme.typography.bodyMuted,
    marginTop: 2,
  },
  listContent: {
    padding: theme.spacing.m,
    paddingBottom: 32,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
  },
  loadingText: {
    ...theme.typography.bodyMuted,
    marginTop: theme.spacing.m,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: theme.spacing.m,
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.l,
  },
  retryBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
    borderRadius: theme.borderRadius.pill,
  },
  retryBtnText: {
    ...theme.typography.button,
  },
  // ── Card ────────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.pill,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  price: {
    ...theme.typography.title,
    fontSize: 20,
    color: theme.colors.success,
  },
  // ── Route ───────────────────────────────────────────────────────────────────
  routeContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
  },
  routeDots: {
    alignItems: 'center',
    marginRight: theme.spacing.m,
    paddingTop: 2,
  },
  pickupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  routeLine: {
    width: 2,
    height: 28,
    backgroundColor: theme.colors.border,
    marginVertical: 3,
  },
  dropoffDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.text,
  },
  routeTexts: {
    flex: 1,
  },
  routeLabel: {
    ...theme.typography.bodyMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeAddress: {
    ...theme.typography.body,
    fontWeight: '500',
    fontSize: 14,
  },
  routeSpacer: {
    height: 12,
  },
  // ── Footer ──────────────────────────────────────────────────────────────────
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: theme.spacing.s,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    ...theme.typography.bodyMuted,
    fontSize: 13,
  },
  footerLabel: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  dateText: {
    ...theme.typography.bodyMuted,
    fontSize: 12,
  },
  // ── Empty ───────────────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: theme.spacing.m,
  },
  emptyTitle: {
    ...theme.typography.title,
    marginBottom: theme.spacing.s,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...theme.typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  
  skeletonCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    height: 180,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  skeletonHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
});
