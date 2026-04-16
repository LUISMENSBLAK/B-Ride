import { useAppTheme } from '../hooks/useAppTheme';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList,
  StyleSheet, TouchableOpacity, Platform, Modal, ActivityIndicator
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Rect, Circle, Path } from 'react-native-svg';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import Loader from '../components/Loader';
import SkeletonLoader from '../components/SkeletonLoader';
import { useTranslation } from '../hooks/useTranslation';
import { useCurrency } from '../hooks/useCurrency';

export default function RideHistory() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const { user } = useAuthStore();
  const { t, lang } = useTranslation();
  const { formatPrice } = useCurrency();

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0); 
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Modal State
  const [selectedRide, setSelectedRide] = useState<any | null>(null);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setPage(1);
    setHasMore(true);
    setRides([]);
    setRetryCount(c => c + 1);
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!hasMore && page !== 1) return;
      if (page === 1) setLoading(true);
      else setLoadingMore(true);

      try {
        const res = await client.get(`/rides/history?page=${page}&limit=10`);
        if (res.data.success) {
          const fetched = res.data.data;
          if (page === 1) setRides(fetched);
          else setRides(prev => [...prev, ...fetched]);
          
          if (page >= res.data.pages) setHasMore(false);
        }
      } catch (error: any) {
        if (page === 1) setError(error.response?.data?.message || error.message || 'Error al obtener historial');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    };
    fetchHistory();
  }, [page, retryCount]);

  const onEndReached = () => {
    if (!loading && !loadingMore && hasMore) {
        setPage(p => p + 1);
    }
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Svg width={120} height={80} viewBox="0 0 120 80" fill="none">
        {/* Coche simple Wixárika */}
        <Rect x="20" y="30" width="80" height="28" rx="8" fill={theme.colors.surfaceHigh} stroke={theme.colors.border} strokeWidth={1.5} />
        <Path d="M30 30 L38 18 H82 L90 30" stroke={theme.colors.border} strokeWidth={1.5} strokeLinejoin="round" fill="none" />
        <Circle cx="36" cy="59" r="8" fill={theme.colors.surfaceHigh} stroke={theme.colors.primary} strokeWidth={1.5} />
        <Circle cx="84" cy="59" r="8" fill={theme.colors.surfaceHigh} stroke={theme.colors.primary} strokeWidth={1.5} />
        <Rect x="44" y="19" width="32" height="12" rx="3" fill={theme.colors.primaryLight} />
        {/* Línea punteada de ruta */}
        <Path d="M10 72 H110" stroke={theme.colors.border} strokeWidth={1} strokeDasharray="4 4" />
      </Svg>
      <Text style={styles.emptyTitle}>Sin viajes aún</Text>
      <Text style={styles.emptySubtitle}>Tu historial de viajes aparecerá aquí</Text>
    </View>
  );

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
      <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedRide(item)}>
          <View style={styles.card}>
            {/* Header de la card */}
            <View style={styles.cardHeader}>
              <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              </View>
              <Text style={styles.price}>{formatPrice(displayPrice)}</Text>
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
      </TouchableOpacity>
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
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator size="small" style={{ margin: 20 }} /> : null}
        ListEmptyComponent={loading ? null : renderEmpty()}
      />

      {/* MODAL BLOQUE 6 */}
      <Modal visible={!!selectedRide} animationType="slide" transparent>
         <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
               <Text style={styles.modalTitle}>Detalles del Viaje</Text>
               {selectedRide && (
                  <>
                    <Text style={styles.modalLabel}>ID: {selectedRide._id}</Text>
                    <Text style={styles.modalLabel}>Estado: {selectedRide.status}</Text>
                    <Text style={styles.modalLabel}>Origen: {selectedRide.pickupLocation?.address}</Text>
                    <Text style={styles.modalLabel}>Destino: {selectedRide.dropoffLocation?.address}</Text>
                  </>
               )}
               <TouchableOpacity style={styles.modalBtn} onPress={() => setSelectedRide(null)}>
                  <Text style={styles.modalBtnText}>Cerrar</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>
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
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: theme.spacing.xxxl, gap: 12,
  },
  emptyTitle: { ...theme.typography.title, color: theme.colors.text, textAlign: 'center' },
  emptySubtitle: { ...theme.typography.bodyMuted, textAlign: 'center', paddingHorizontal: 40 },
  
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
  },
  modalContent: {
    width: '80%', padding: 20, backgroundColor: theme.colors.background, borderRadius: 12
  },
  modalTitle: { ...theme.typography.title, fontSize: 20, marginBottom: 15 },
  modalLabel: { ...theme.typography.body, marginBottom: 10 },
  modalBtn: { marginTop: 20, padding: 12, backgroundColor: theme.colors.primary, borderRadius: 8, alignItems: 'center' },
  modalBtnText: { color: theme.colors.primaryText, fontWeight: '700' }
});
