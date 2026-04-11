import { useAppTheme } from '../../hooks/useAppTheme';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRideFlowStore } from '../../store/useRideFlowStore';
import { theme } from '../../theme';
import { useTranslation } from '../../hooks/useTranslation';
import api from '../../api/client';

export default function PaymentStatusScreen() {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t } = useTranslation();
  // BUG 14 FIX: Destructurar resetFlow del store para que el botón "Volver a inicio" funcione
  const { resetFlow } = useRideFlowStore();

  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  const [loading, setLoading] = React.useState(true);
  const [finalPrice, setFinalPrice] = React.useState<string | number>('—');
  const [isCompleted, setIsCompleted] = React.useState(false);

  React.useEffect(() => {
    (async () => {
        try {
            let targetRideId = route.params?.rideId;
            const explicitStatus = route.params?.status;
            const explicitPrice = route.params?.price;
            
            if (targetRideId) {
                // Si llegamos vía navegación directa, cacheamos el recibo para el futuro
                await AsyncStorage.setItem('lastCompletedRideId', targetRideId);
                setFinalPrice(explicitPrice ?? '—');
                setIsCompleted(explicitStatus === 'COMPLETED');
                setLoading(false);
                return;
            }
            
            // Si el user hizo refresh / wipe screen, extraemos de caché y backend
            const cachedId = await AsyncStorage.getItem('lastCompletedRideId');
            if (!cachedId) {
                setLoading(false);
                return;
            }

            const res = await api.get(`/rides/${cachedId}/state`);
            if (res.data?.success && res.data?.data) {
                const fetchedRide = res.data.data;
                const price = fetchedRide?.bids?.find((b: any) => b.status === 'ACCEPTED')?.price
                                ?? fetchedRide?.proposedPrice
                                ?? '—';
                setFinalPrice(price);
                setIsCompleted(fetchedRide.status === 'COMPLETED');
            }
        } catch (e) {
            console.error('[PaymentStatus] Re-fetch error:', e);
        } finally {
            setLoading(false);
        }
    })();
  }, [route.params]);

  if (loading) {
      return (
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
      );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Icono de estado */}
        <View style={[styles.iconWrap, isCompleted ? styles.iconSuccess : styles.iconPending]}>
          <Text style={styles.icon}>{isCompleted ? '✓' : '⏳'}</Text>
        </View>

        <Text style={styles.title}>
          {isCompleted ? t('payment.processed') : t('payment.processing')}
        </Text>
        <Text style={styles.amount}>${finalPrice}</Text>
        <Text style={styles.subtitle}>
          {isCompleted
            ? t('payment.chargedOk')
            : t('payment.waitConfirm')}
        </Text>

        {/* Detalle del cobro */}
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('payment.fareCharged')}</Text>
            <Text style={styles.detailValue}>${finalPrice}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('payment.method')}</Text>
            <Text style={styles.detailValue}>Stripe (card)</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>{t('payment.status')}</Text>
            <Text style={[styles.detailValue, { color: isCompleted ? theme.colors.success : theme.colors.primary }]}>
              {isCompleted ? t('payment.captured') : t('payment.pending')}
            </Text>
          </View>
        </View>

        {isCompleted && (
          <TouchableOpacity style={styles.doneBtn} onPress={() => {
            // BUG 20 FIX: Limpiar el recibo cacheado al salir
            AsyncStorage.removeItem('lastCompletedRideId').catch(() => {});
            resetFlow();
          }}>
            <Text style={styles.doneBtnText}>{t('payment.backHome')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: Platform.OS === 'ios' ? 80 : 60, paddingHorizontal: theme.spacing.xl, paddingBottom: 40, alignItems: 'center' },
  iconWrap: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.xl },
  iconSuccess: { backgroundColor: theme.colors.success },
  iconPending: { backgroundColor: theme.colors.primary },
  icon: { fontSize: 40, color: theme.colors.primaryText, fontWeight: '800' },
  title: { ...theme.typography.header, fontSize: 26, marginBottom: theme.spacing.s, textAlign: 'center' },
  subtitle: { ...theme.typography.bodyMuted, textAlign: 'center', marginBottom: theme.spacing.xl },
  detailCard: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.l,
    marginBottom: theme.spacing.xl,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  detailLabel: { ...theme.typography.bodyMuted },
  detailValue: { ...theme.typography.body, fontWeight: '700' },
  doneBtn: {
    width: '100%',
    backgroundColor: theme.colors.primary,
    padding: 18,
    borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
  },
  doneBtnText: { ...theme.typography.button },
});
