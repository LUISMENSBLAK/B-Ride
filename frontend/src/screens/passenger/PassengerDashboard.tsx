import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, AppState,
  ActivityIndicator, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, interpolate, Extrapolate, withSequence, runOnJS } from 'react-native-reanimated';
import { useAuthStore } from '../../store/authStore';
import { useRideFlowStore } from '../../store/useRideFlowStore';
import socketService from '../../services/socket';
import client from '../../api/client';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import type { Theme } from '../../theme';
import MapRenderer, { MapRendererHandle } from '../../components/MapRenderer';
import AddressAutocomplete, { PlaceResult } from '../../components/AddressAutocomplete';
import { useRideSocketEvent } from '../../services/EventManager';
import { useDriverTracking } from '../../hooks/useDriverTracking';
import { RideData } from '../../types/ride';
import { syncRideState } from '../../api/ride';
import BidCard from '../../components/BidCard';
import { stripeFrontendService } from '../../services/stripe';
import Loader from '../../components/Loader';
import SOSButton from '../../components/SOSButton';
import ChatSheet from '../../components/ChatSheet';
import SearchingDriversView from '../../components/SearchingDriversView';
import { RatingModal } from '../../components/RatingModal';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import PriceInputSheet from '../../components/PriceInputSheet';
import { haversineKm } from '../../utils/geo';
import { useCurrency } from '../../hooks/useCurrency';

// ─── SUB-COMPONENTS WIXÁRIKA V3 ───────────────────────────────────────────────

function firstName(name?: string) {
  return name?.split(' ')[0] ?? 'Viajero';
}

// ── TopBar Flotante ────────────────────────────────────────────────────────
const TopBar = memo(({ userName, profilePhoto, onAvatarPress, theme }: any) => {
  const insets = useSafeAreaInsets();
  const topPosition = Math.max(insets.top, 20) + 12;

  return (
    <View style={[topBarStyles.container, { top: topPosition }]}>
      <TouchableOpacity style={topBarStyles.leftSection} onPress={onAvatarPress} activeOpacity={0.8}>
        {profilePhoto ? (
           <Image source={{ uri: profilePhoto }} style={topBarStyles.avatar} />
        ) : (
           <View style={[topBarStyles.avatar, { backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
             <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{firstName(userName)[0]}</Text>
           </View>
        )}
        <View style={topBarStyles.textBlock}>
          <Text style={topBarStyles.greeting}>Hola, {firstName(userName)} 👋</Text>
          <Text style={topBarStyles.subText}>Ubicación actual detectada</Text>
        </View>
      </TouchableOpacity>
      
      <TouchableOpacity style={topBarStyles.notifBtn}>
        <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
        <View style={topBarStyles.notifBadge} />
      </TouchableOpacity>
    </View>
  );
});

const topBarStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(13,5,32,0.55)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  leftSection: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: '#F5C518' },
  textBlock: { justifyContent: 'center' },
  greeting: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  subText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  notifBtn: { 
    width: 36, height: 36, borderRadius: 18, 
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center' 
  },
  notifBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FF6B6B',
    borderWidth: 1.5, borderColor: '#0D0520'
  }
});

// ── Pill de Conductores Cercanos ───────────────────────────────────────────
const DriverPill = memo(({ count, animatedIndex }: { count: number, animatedIndex: Animated.SharedValue<number> }) => {
  const isZero = count === 0;
  const pulseAnim = useSharedValue(0.6);

  useEffect(() => {
    pulseAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: isZero ? 1500 : 1000 }),
        withTiming(0.6, { duration: isZero ? 1500 : 1000 })
      ),
      -1,
      true
    );
  }, [count]);

  const stylez = useAnimatedStyle(() => ({
    opacity: interpolate(animatedIndex.value, [1, 1.5, 2], [1, 0.5, 0], Extrapolate.CLAMP),
    transform: [{ scale: interpolate(animatedIndex.value, [1, 2], [1, 0.9]) }]
  }));

  const iconStylez = useAnimatedStyle(() => ({ opacity: pulseAnim.value }));

  if (count === 0) return null;

  return (
    <Animated.View style={[driverPillStyles.container, {
      backgroundColor: 'rgba(245,197,24,0.15)',
      borderColor: 'rgba(245,197,24,0.35)',
    }, stylez]}>
      <Animated.View style={iconStylez}>
        <Ionicons name="car" size={16} color="#F5C518" />
      </Animated.View>
      <Text style={[driverPillStyles.text, { color: '#F5C518' }]}>
        {`${count} conductor${count !== 1 ? 'es' : ''} cerca`}
      </Text>
    </Animated.View>
  );
});

const driverPillStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    zIndex: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    gap: 8,
  },
  text: { fontSize: 13, fontWeight: '600' }
});

// ── Favoritos Dinámicos ───────────────────────────────────────────────
const FavoritesList = memo(({ onSelect, favorites }: any) => {
  const displayFavorites = favorites && favorites.length > 0
    ? favorites
    : [{ id: 'add', name: '+ Agregar favorito', isEmptyState: true }];

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {displayFavorites.map((fav: any) => (
          <TouchableOpacity key={fav.id} onPress={() => onSelect(fav)} activeOpacity={0.8}>
            <View style={[favStyles.chip, fav.isEmptyState && favStyles.chipDashed]}>
              <Ionicons name={fav.isEmptyState ? 'add' : 'star'} size={14} color={fav.isEmptyState ? 'rgba(255,255,255,0.4)' : '#F5C518'} />
              <Text style={[favStyles.name, fav.isEmptyState && { color: 'rgba(255,255,255,0.6)' }]}>
                {fav.name}
              </Text>
              {!fav.isEmptyState && fav.dist && <Text style={favStyles.dist}>{fav.dist}</Text>}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

const favStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    gap: 6
  },
  chipDashed: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  name: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  dist: { color: 'rgba(255,255,255,0.5)', fontSize: 11 }
});

// ── Payment Mini Chip ──────────────────────────────────────────────────────
const PaymentMiniChip = memo(() => {
  return (
    <TouchableOpacity style={paymentChipStyles.chip} activeOpacity={0.8}>
      <Ionicons name="cash-outline" size={16} color="#C4B8E0" />
      <Text style={paymentChipStyles.text}>Efectivo</Text>
      <Ionicons name="chevron-down" size={14} color="#C4B8E0" />
    </TouchableOpacity>
  );
});

const paymentChipStyles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    marginTop: 12, gap: 6
  },
  text: { color: '#FFFFFF', fontSize: 13, fontWeight: '500' }
});

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function PassengerDashboard() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const animatedIndex = useSharedValue(0);

  const theme = useAppTheme();
  const { t } = useTranslation();
  const { currency, formatPrice, convertToUsd } = useCurrency();
  const styles = React.useMemo(() => getStyles(theme), [theme]);


  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  // Trip state centralizado
  const { status: rideStatus, setStatus: setRideStatus, rideId: currentRideId, setRideContext, bids, receiveBid, resetFlow, setActiveRide, paymentMethod } = useRideFlowStore();
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [price, setPrice] = useState('');
  const [completedRide, setCompletedRide] = useState<RideData | null>(null);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [paymentAuthorizing, setPaymentAuthorizing] = useState<boolean>(false);
  const [paymentStatusText, setPaymentStatusText] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [estimatedTimeMin, setEstimatedTimeMin] = useState<number>(0);

  // PriceInputSheet states
  const [priceSheetVisible, setPriceSheetVisible] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<any>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Promos y agendado
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState<{type: string, value: number} | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoInputOpen, setPromoInputOpen] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);

  // Auto-calcular distancia y tarifa sugerida
  useEffect(() => {
    if (selectedPlace && location) {
      if (selectedPlace.latitude !== undefined && selectedPlace.longitude !== undefined) {
        const dist = haversineKm(
          location.coords.latitude, location.coords.longitude,
          selectedPlace.latitude, selectedPlace.longitude
        );
        setDistanceKm(Number(dist.toFixed(1)));
        const hour = new Date().getHours();
        const trafficMultiplier = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.4 : 1.0;
        const baseEta = Math.max(1, Math.round((dist / 40) * 60));
        setEstimatedTimeMin(Math.round(baseEta * trafficMultiplier));
      }
    } else {
      setDistanceKm(0);
      setEstimatedTimeMin(0);
    }
  }, [selectedPlace, location]);

  const [vehicleCategory, setVehicleCategory] = useState<any>('ECONOMY');

  useEffect(() => {
    let active = true;
    const fetchPrice = async () => {
      if (distanceKm > 0 && selectedPlace && location) {
        setLoadingQuotes(true);
        try {
          const res = await client.get('/rides/quote', {
            params: {
              originLat: location.coords.latitude,
              originLng: location.coords.longitude,
              destLat: selectedPlace.latitude,
              destLng: selectedPlace.longitude,
            }
          });
          if (!active) return;
          if (res.data?.success) {
            const cats = res.data.data?.categories ?? res.data.data ?? null;
            setCategoryOptions(cats);
            const catData = cats?.[vehicleCategory];
            const suggestedMXN = catData?.priceMXN ?? catData?.recommendedPrice ?? 0;
            if (suggestedMXN > 0) {
              let localPrice = suggestedMXN;
              if (promoDiscount) {
                if (promoDiscount.type === 'PERCENTAGE') {
                  localPrice = localPrice * (1 - promoDiscount.value / 100);
                } else {
                  localPrice = Math.max(10, localPrice - promoDiscount.value);
                }
              }
              setPrice(localPrice.toFixed(2));
            }
          }
        } catch (e) {
          console.warn('Error fetching quote:', e);
        } finally {
          if (active) setLoadingQuotes(false);
        }
      } else {
        setCategoryOptions(null);
        setPrice('');
      }
    };
    fetchPrice();
    return () => { active = false; };
  }, [distanceKm, selectedPlace, location, vehicleCategory, promoDiscount]);

  const mapRef = useRef<MapRendererHandle>(null);
  const { pushLocation, stopTracking } = useDriverTracking(mapRef);

  const localVersion = useRef(0);

  // Refs anti-stale-closure
  const currentRideIdRef = useRef<string | null>(null);
  useEffect(() => { currentRideIdRef.current = currentRideId; }, [currentRideId]);

  const checkLocationStatus = useCallback(async () => {
    let isMounted = true;
    try {
      setErrorMsg(null);
      const providerStatus = await Location.getProviderStatusAsync();
      if (!providerStatus.locationServicesEnabled) {
        setErrorMsg(t('passenger.gpsDisabled', { defaultValue: 'Por favor, activa el GPS de tu dispositivo para continuar.' }));
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMounted) return;
      if (status !== 'granted') {
        setErrorMsg(t('passenger.permissionDenied', { defaultValue: 'Permiso de ubicación denegado. Se requiere para pedir un ride.' }));
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!isMounted) return;
      setLocation(loc);
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (newLoc) => { if (isMounted) setLocation(newLoc); }
      );
      return sub;
    } catch (error: unknown) {
      if (isMounted) setErrorMsg(t('passenger.locationServiceError', { defaultValue: 'No pudimos obtener tu ubicación. Verifica tu conexión a internet.' }));
      return null;
    }
  }, []);

  // ─── Socket setup y Location INIT ───────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let locationSubscription: Location.LocationSubscription | null = null;

    const sub = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && currentRideIdRef.current) {
        const serverRideState = await syncRideState(currentRideIdRef.current);
        if (serverRideState && serverRideState.version > localVersion.current) {
          localVersion.current = serverRideState.version;
          setRideStatus(serverRideState.status);
        }
      }
    });

    checkLocationStatus().then(sub => {
      if (sub) locationSubscription = sub;
    });

    return () => {
      isMounted = false;
      locationSubscription?.remove();
      sub.remove();
    };
  }, [checkLocationStatus]);

  // Timeout para cancelar la busqueda de conductores automaticamente con 5 min (300,000s)
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING') {
      timeout = setTimeout(() => {
        Alert.alert('Aviso', 'No encontramos conductores disponibles en este momento. Inténtalo de nuevo en unos minutos.');
      }, 300000);
    }
    return () => clearTimeout(timeout);
  }, [rideStatus]);

  const [activeDriversCount, setActiveDriversCount] = useState<number>(0);
  const [showDriverBanner, setShowDriverBanner] = useState<boolean>(false);

  // --- EVENTOS SOCKET CENTRALIZADOS ---

  useRideSocketEvent('driver_available_nearby', useCallback((data: any) => {
    setActiveDriversCount(data && data.count != null ? data.count : (prev => prev + 1));
    const currentStatus = useRideFlowStore.getState().status;
    if (currentStatus === 'SEARCHING' || currentStatus === 'REQUESTING' || currentStatus === 'NEGOTIATING') {
      setShowDriverBanner(true);
      setTimeout(() => setShowDriverBanner(false), 3000);
    }
  }, []));

  useRideSocketEvent('rideRequestCreated', useCallback((ride: any) => {
    setRideContext(ride._id);
    socketService.setRideRoom(ride._id);
    localVersion.current = ride.version || 1;
    setRideStatus('SEARCHING');
  }, []));

  useRideSocketEvent('no_drivers_available', useCallback((data: any) => {
    Alert.alert('Sin conductores', data.message);
    resetFlow();
    setPrice('');
  }, []));

  useRideSocketEvent('trip_bid_received', useCallback((updatedRide: any) => {
    if (updatedRide.bids) {
      const isFirstBid = useRideFlowStore.getState().bids.length === 0;
      if (isFirstBid) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const pending = updatedRide.bids
        .filter((b: any) => b.status === 'PENDING')
        .sort((a: any, b: any) => a.price - b.price);
      pending.forEach((b: any) => receiveBid(b));
    }
  }, []));

  useRideSocketEvent('trip_state_changed', useCallback((updatedRide) => {
    const { status, version } = updatedRide;
    if (version && version <= localVersion.current) return;
    if (version) localVersion.current = version;

    if (status === 'ACCEPTED') {
      setActiveRide(updatedRide);
      setRideStatus('ACCEPTED');
      bottomSheetRef.current?.snapToIndex(1);
    } else if (status === 'ARRIVED') {
      setRideStatus('ARRIVED');
    } else if (status === 'IN_PROGRESS') {
      setRideStatus('IN_PROGRESS');
    } else if (status === 'COMPLETED' || status === 'CANCELLED') {
      if (status === 'COMPLETED') {
        const finalPrice = updatedRide?.bids?.find((b: any) => b.status === 'ACCEPTED')?.price
          ?? updatedRide?.proposedPrice
          ?? '—';
        stopTracking();
        resetFlow();
        setPrice('');
        setAcceptingBidId(null);
        setSelectedPlace(null);
        bottomSheetRef.current?.snapToIndex(1);
        navigation.navigate('PassengerPayment', {
          price: finalPrice,
          rideId: updatedRide?._id,
          status: 'COMPLETED'
        });
      } else {
        stopTracking();
        resetFlow();
        setPrice('');
        setAcceptingBidId(null);
        setSelectedPlace(null);
        bottomSheetRef.current?.snapToIndex(1);
        Alert.alert(t('errors.rideCancelled'), t('errors.driverCancelled'));
      }
    }
  }, [stopTracking]));

  useRideSocketEvent('driverLocationUpdate', useCallback((locData) => {
    pushLocation(locData.latitude, locData.longitude);
  }, [pushLocation]));

  useRideSocketEvent('rideError', useCallback((error) => {
    Alert.alert('Error', error.message);
    resetFlow();
    setAcceptingBidId(null);
  }, []));

  useRideSocketEvent('driver_warning', useCallback((data: any) => {
    Alert.alert('⚠️ Aviso del conductor', data?.message || 'El conductor reporta un problema en la ruta.');
  }, []));

  useRideSocketEvent('driver_disconnected', useCallback((data: any) => {
    Alert.alert(
      '📡 Conductor desconectado',
      'Se perdió la conexión con el conductor. Si persiste, contacta a soporte.',
      [
        { text: 'OK', style: 'default' },
        { text: 'SOS', style: 'destructive', onPress: () => {} },
      ]
    );
  }, []));

  useRideSocketEvent('rating_submitted', useCallback(({ newAvg }) => {
    Alert.alert('¡Gracias!', `Tu calificación fue enviada. Rating del conductor: ${newAvg} ★`);
  }, []));

  useRideSocketEvent('ride:cancelled', useCallback(({ rideId }) => {
    stopTracking();
    resetFlow();
    setPrice('');
    setAcceptingBidId(null);
    setSelectedPlace(null);
    setDistanceKm(0);
    setEstimatedTimeMin(0);
    socketService.setRideRoom(null);
    bottomSheetRef.current?.snapToIndex(1);
    Alert.alert('Ride Cancelado', 'El conductor ha cancelado. Puedes pedir un nuevo ride.');
  }, [stopTracking]));

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRequestRide = useCallback(async (finalPrice: number, finalCategory: any) => {
    if (!user?.avatarUrl && !user?.profilePhoto) {
      Alert.alert(
        'Foto Obligatoria',
        'Por seguridad, debes subir una foto de perfil antes de pedir un ride.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Subir Foto', onPress: () => navigation.navigate('PassengerProfile') }
        ]
      );
      return;
    }
    if (distanceKm > 100) {
      Alert.alert(t('errors.outOfRange'), t('errors.outOfRangeMsg'));
      return;
    }
    if (!selectedPlace) {
      Alert.alert(t('errors.selectDestination'), t('errors.selectDestinationMsg'));
      return;
    }
    if (!location) {
      Alert.alert(t('errors.locationNotReady'), t('errors.locationNotReadyMsg'));
      return;
    }
    setPrice(String(finalPrice));
    setVehicleCategory(finalCategory);
    setPriceSheetVisible(false);
    setRideStatus('REQUESTING');
    try {
      await socketService.emitWithAck('requestRide', {
        passengerId: user?._id,
        pickupLocation: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: 'Mi Ubicación Actual',
        },
        dropoffLocation: {
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          address: selectedPlace.displayName,
        },
        proposedPrice: convertToUsd(finalPrice),
        currency: currency,
        paymentMethod,
        promoCode: promoDiscount ? promoCode : undefined,
        vehicleCategory: finalCategory,
      }, 3, 5000);
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; response?: any };
      Alert.alert('Error de conexión', err.message || 'No se pudo enviar la solicitud.');
      setRideStatus('IDLE');
    }
  }, [selectedPlace, location, user, convertToUsd, currency, paymentMethod, distanceKm, promoDiscount, promoCode]);

  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handleAcceptBid = useCallback(async (bidId: string, driverId: string) => {
    if (acceptingBidId || paymentAuthorizing) return;
    setAcceptingBidId(bidId);

    if (currentRideId) {
      try {
        setPaymentAuthorizing(true);
        setPaymentStatusText(t('payment.processing', { defaultValue: 'Procesando pago de forma segura...' }));

        if (paymentMethod === 'CARD') {
          const stripeRes = await stripeFrontendService.createPaymentIntent(currentRideId, bidId, currency);
          if (stripeRes.state === 'error') throw new Error(stripeRes.error || 'Fallo al retener fondos en tarjeta.');

          setPaymentStatusText(t('payment.confirming', { defaultValue: 'Esperando confirmación del banco...' }));
          const { error: initError } = await initPaymentSheet({
            paymentIntentClientSecret: stripeRes.clientSecret as string,
            merchantDisplayName: 'B-Ride',
            applePay: { merchantCountryCode: 'US' },
            googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
            defaultBillingDetails: { name: user?.name || '' },
          });
          if (initError) throw new Error(initError.message);

          setPaymentStatusText(t('payment.authorizing', { defaultValue: 'Autorizando transacción...' }));
          const { error: presentError } = await presentPaymentSheet();
          if (presentError) {
            setAcceptingBidId(null);
            setPaymentAuthorizing(false);
            setPaymentStatusText(null);
            return;
          }

          setPaymentStatusText(t('payment.success', { defaultValue: '¡Pago exitoso!' }));
          await new Promise(r => setTimeout(r, 600));
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await socketService.emitWithAck('trip_accept_bid', {
          rideId: currentRideId,
          passengerId: user?._id,
          bidId,
          driverId,
          paymentMethod,
        });
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string; response?: any };
        Alert.alert('Transacción Detenida', err.message || 'No se pudo autorizar el pago.');
        setAcceptingBidId(null);
      } finally {
        setPaymentAuthorizing(false);
        setPaymentStatusText(null);
      }
    }
  }, [currentRideId, user, acceptingBidId, paymentAuthorizing, initPaymentSheet, presentPaymentSheet]);

  const handleCancelRequest = useCallback(async () => {
    const rideId = currentRideIdRef.current;
    if (rideId) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await socketService.emitWithAck('cancel_ride', { rideId, passengerId: user?._id });
      } catch (e) {
        console.warn('Fallback: Failed cancel explicitly but resetting locally');
      }
    }
    socketService.setRideRoom(null);
    resetFlow();
    setAcceptingBidId(null);
    setSelectedPlace(null);
    setPrice('');
    setDistanceKm(0);
    setEstimatedTimeMin(0);
    setPromoCode('');
    setPromoDiscount(null);
    bottomSheetRef.current?.snapToIndex(1);
  }, [user]);

  const handleApplyPromo = async () => {
    if (!promoCode) return;
    setPromoApplying(true);
    try {
      const res = await client.post('/promos/validate', { code: promoCode, rideValue: convertToUsd(Number(price)) });
      if (res.data.success) {
        setPromoDiscount({ type: res.data.data.type, value: res.data.data.value });
        Alert.alert('Promoción aplicada', 'El descuento ha sido reflejado en el precio.');
      }
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; response?: any };
      Alert.alert('Error promo', err.response?.data?.message || 'Código inválido.');
      setPromoDiscount(null);
    } finally {
      setPromoApplying(false);
    }
  };

  const handleScheduleRide = async (hoursAhead: number) => {
    if (!selectedPlace || !location) return;
    setScheduleModalVisible(false);
    const scheduledDate = new Date();
    scheduledDate.setHours(scheduledDate.getHours() + hoursAhead);
    try {
      const res = await client.post('/rides/schedule', {
        passengerId: user?._id,
        pickupAddress: 'Mi Ubicación Actual',
        pickupLat: location.coords.latitude,
        pickupLng: location.coords.longitude,
        dropoffAddress: selectedPlace.displayName,
        dropoffLat: selectedPlace.latitude,
        dropoffLng: selectedPlace.longitude,
        proposedPrice: convertToUsd(Number(price)),
        currency,
        paymentMethod,
        vehicleCategory,
        scheduledAt: scheduledDate.toISOString()
      });
      if (res.data.success) {
        Alert.alert('Ride Programado', `Tu ride ha sido programado para ${scheduledDate.toLocaleString()}`);
        handleCancelRequest();
      }
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; response?: any };
      Alert.alert('Error al programar', err.response?.data?.message || 'Algo salió mal');
    }
  };

  const handleRateDriver = useCallback(async (score: number, comment: string) => {
    if (completedRide) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await socketService.emitWithAck('rate_driver', {
          rideId: completedRide._id,
          driverId: (completedRide.driver as any)?._id ?? completedRide.driver,
          fromUserId: user?._id,
          score,
        });
        if (comment) {
          await client.post(`/rides/${completedRide._id}/comment`, { text: comment });
        }
      } catch (error: unknown) {
        const err = error as { message?: string; code?: string; response?: any };
        Alert.alert('Error Calificando', err.message || 'No se pudo enviar la calificación.');
      }
    }
    setCompletedRide(null);
  }, [completedRide, user]);

  const handleSkipRating = useCallback(() => setCompletedRide(null), []);

  const isSearching =
    rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING';
  const isActiveRide =
    rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' || rideStatus === 'IN_PROGRESS' || rideStatus === 'ACTIVE' || rideStatus === 'MAPPED';
  const isIdle = rideStatus === 'IDLE';

  const bestBidId = bids.length > 0 ? bids[0]._id : null;

  // Determine bottom sheet snap points
  const snapPoints = React.useMemo(() => [
    100,
    isSearching ? '72%' : isActiveRide ? '32%' : '60%',
    '92%',
  ], [isSearching, isActiveRide]);

  // ─── Active ride status label ────────────────────────────────────────────
  const activeStatusLabel = () => {
    if (rideStatus === 'ARRIVED') return 'Tu conductor llegó';
    if (rideStatus === 'IN_PROGRESS') return 'Disfruta tu ride';
    return 'Tu ride está en camino';
  };

  // ─── Map Animated Scale ──────────────────────────────────────────────────
  const mapAnimatedStyle = useAnimatedStyle(() => {
    // Escala 1.0 en snappoints 0 y 1 ('25%', '60%'), 0.96 en snappoint 2 ('92%')
    const scale = interpolate(animatedIndex.value, [0, 1, 2], [1, 1, 0.96], Extrapolate.CLAMP);
    return { transform: [{ scale }] };
  });

  return (
    <View style={styles.container}>
      {/* ── Background Map ── */}
      <Animated.View style={[{ flex: 1, backgroundColor: '#0D0520' }, mapAnimatedStyle]}>
        {location ? (
          <MapRenderer
            ref={mapRef}
            latitude={location.coords.latitude}
            longitude={location.coords.longitude}
            title={t('general.locating')}
            destinationCoordinate={
              (selectedPlace && selectedPlace.latitude !== undefined && selectedPlace.longitude !== undefined)
                ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude }
                : undefined
            }
          />
        ) : (
          <View style={styles.loaderContainer}>
            {errorMsg ? (
              <View style={styles.errorCard}>
                <Ionicons name="location" size={48} color={theme.colors.error} style={{ marginBottom: 14 }} />
                <Text style={styles.errorTitle}>{errorMsg === 'GPS_DISABLED' ? t('errors.locationNotReady') : t('general.locationFailed')}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={checkLocationStatus}>
                  <Text style={styles.retryBtnText}>{t('history.retry')}</Text>
                </TouchableOpacity>
              </View>
            ) : <Loader label={t('general.locating')} />}
          </View>
        )}
      </Animated.View>

      {/* ── Floating Header & Pill (only IDLE) ── */}
      {isIdle && (
        <>
          <TopBar
            userName={user?.name}
            profilePhoto={user?.profilePhoto || user?.avatarUrl}
            onAvatarPress={() => navigation.navigate('PassengerProfile')}
            theme={theme}
          />
          <DriverPill count={activeDriversCount} animatedIndex={animatedIndex} />
        </>
      )}

      {/* Driver found banner (during SEARCHING) */}
      {showDriverBanner && (
        <View style={styles.topDriverBanner}>
          <View style={styles.topDriverBannerDot} />
          <Text style={styles.topDriverBannerText}>Buscando tu ride…</Text>
        </View>
      )}

      {/* ── Main BottomSheet ── */}
      <BottomSheet
        ref={bottomSheetRef}
        index={isIdle ? 0 : 1}
        snapPoints={snapPoints}
        animatedIndex={animatedIndex}
        backgroundStyle={{ backgroundColor: 'rgba(13,5,32,0.92)' }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.20)', width: 36, height: 4 }}
        keyboardBehavior="extend"
        enablePanDownToClose={false}
      >
        {isIdle ? (
          <View style={{ flex: 1, paddingBottom: 32, paddingHorizontal: 16 }}>
            <View style={{ flex: 1 }}>
              {/* Search Box / Autocomplete Area */}
              <Animated.View style={{ flex: 1, minHeight: 56 }}>
                 <AddressAutocomplete
                    placeholder="¿A dónde te llevamos hoy?"
                    onSelect={(place) => {
                      setSelectedPlace(place);
                      bottomSheetRef.current?.snapToIndex(1);
                      Keyboard.dismiss();
                    }}
                    userLat={location?.coords.latitude}
                    userLng={location?.coords.longitude}
                 />
              </Animated.View>

              {/* Contenido Secundario (Favoritos y Pago) que desaparece si se arrastra hasta abajo o arriba del todo */}
              <Animated.View style={[{ overflow: 'hidden' }, useAnimatedStyle(() => {
                // Hacer opaco en index 1 (60%). Ocultarlo en index 0 (100px) o index 2 (92%)
                const opacity = interpolate(animatedIndex.value, [0, 0.4, 1, 1.6, 2], [0, 0, 1, 0, 0], Extrapolate.CLAMP);
                const height = interpolate(animatedIndex.value, [0, 0.5, 1, 1.5, 2], [0, 40, 120, 40, 0], Extrapolate.CLAMP);
                return { opacity, height };
              })]}>
                {/* Favoritos */}
                <FavoritesList favorites={user?.favorites} onSelect={(fav: any) => {
                   // Mock select logic
                   bottomSheetRef.current?.snapToIndex(1);
                   Haptics.selectionAsync();
                }} />

                {/* Payment Mini Chip */}
                <PaymentMiniChip />
              </Animated.View>

              {/* Selected Destination Details (Visible when destination selected but ride not confirmed) */}
              {selectedPlace && (
                <View style={[styles.selectedDestCard, { marginTop: 20 }]}>
                  <View style={styles.selectedDestRow}>
                    <View style={styles.destDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.selectedDestLabel}>Destino actual</Text>
                      <Text style={styles.selectedDestName} numberOfLines={2}>{selectedPlace.displayName}</Text>
                      {distanceKm > 0 && <Text style={styles.selectedDestMeta}>{distanceKm} km · ~{estimatedTimeMin} min</Text>}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.ctaButton, { marginTop: 12 }]}
                    onPress={() => setPriceSheetVisible(true)}
                  >
                    <Text style={styles.ctaButtonText}>Pedir Ride</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : isSearching ? (
          <BottomSheetScrollView
            contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              {(rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || (rideStatus === 'NEGOTIATING' && bids.length === 0)) && (
                <>
                  <SearchingDriversView activeDriversCount={activeDriversCount} onCancel={handleCancelRequest} />
                </>
              )}
              {rideStatus === 'NEGOTIATING' && bids.length > 0 && (
                <View style={styles.searchingContainer}>
                  <Text style={styles.statusTitle}>¡Ofertas Recibidas!</Text>
                  <View style={{ marginTop: 8, paddingBottom: 20 }}>
                    {bids.map((item: any) => (
                      <BidCard key={item._id} bid={item} isBest={item._id === bestBidId} onAccept={handleAcceptBid} />
                    ))}
                  </View>
                  <TouchableOpacity style={styles.cancelRequestBtn} onPress={handleCancelRequest}>
                    <Text style={styles.cancelRequestBtnText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </BottomSheetScrollView>
        ) : isActiveRide ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={styles.activeRideCard}>
              <Text style={{ color: '#00CED1', fontWeight: 'bold' }}>{activeStatusLabel()}</Text>
              <Text style={styles.activeDestText}>{selectedPlace?.displayName ?? 'Tu destino'}</Text>
            </View>
          </View>
        ) : null}
      </BottomSheet>

      {/* Sheets & Modals */}
      <ChatSheet rideId={currentRideId} myUserId={user?._id} visible={chatVisible} onClose={() => setChatVisible(false)} />
      <RatingModal visible={!!completedRide} targetName="el conductor" onSubmit={handleRateDriver} onSkip={handleSkipRating} />
      <PriceInputSheet visible={priceSheetVisible} onClose={() => setPriceSheetVisible(false)} onConfirm={handleRequestRide} categoryOptions={categoryOptions} loadingQuotes={loadingQuotes} destAddress={selectedPlace?.displayName} />
    </View>
  );
}


// ─── Main styles ──────────────────────────────────────────────────────────────

const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // ── Loader / Error states
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 32,
  },
  errorCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  errorTitle: {
    ...theme.typography.title,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBody: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: theme.borderRadius.pill,
  },
  retryBtnText: {
    color: theme.colors.primaryText,
    fontWeight: '700',
    fontSize: 16,
  },

  // ── Banners
  topDriverBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 100,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  topDriverBannerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  topDriverBannerText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // ── IDLE Bottom sheet content
  selectedDestCard: {
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  selectedDestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  destDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: theme.colors.text,
    marginTop: 6,
  },
  selectedDestLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  selectedDestName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    lineHeight: 22,
    marginBottom: 4,
  },
  selectedDestMeta: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  changeDestBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyDestCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    marginBottom: 16,
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 10,
  },
  emptyDestText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // ── Promo
  promoLink: {
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  promoInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceHigh,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontWeight: '600',
  },
  promoApplyBtn: {
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 72,
    paddingVertical: 12,
  },
  promoAppliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  promoAppliedText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },

  // ── CTA button
  ctaButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
    marginTop: 4,
  },
  ctaButtonDisabled: {
    backgroundColor: theme.colors.surfaceHigh,
    shadowOpacity: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.primaryText,
    letterSpacing: -0.2,
  },
  ctaButtonTextDisabled: {
    color: theme.colors.textMuted,
  },

  // ── Searching / Negotiating
  priceAdjustCard: {
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  priceAdjustLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  priceAdjustValue: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.primary,
    letterSpacing: -0.5,
  },
  priceStepBtn: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  priceStepBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  searchingContainer: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 24,
  },
  searchingContent: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.l,
  },
  statusTitle: {
    ...theme.typography.title,
    color: theme.colors.text,
    marginBottom: theme.spacing.s,
    textAlign: 'center',
  },
  authStripeBox: {
    backgroundColor: theme.colors.surfaceHigh,
    borderColor: theme.colors.primary,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: theme.borderRadius.m,
    marginBottom: 8,
    width: '100%',
  },
  authStripeText: {
    marginLeft: 10,
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  cancelRequestBtn: {
    marginTop: theme.spacing.m,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelRequestBtnText: {
    ...theme.typography.body,
    color: theme.colors.error,
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Active ride card
  activeRideCard: {
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  activePhaseRow: { marginBottom: 14 },
  activePhasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1.5,
  },
  activePhaseDot: { width: 6, height: 6, borderRadius: 3 },
  activePhaseText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  activeDestText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 18,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  activeActionsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 4,
    paddingTop: 16,
  },
  activeActionBtn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  activeActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeActionText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  sosInline: { width: 56, height: 56, borderRadius: 28 },

  // ── Schedule modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  scheduleSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderBottomWidth: 0,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  scheduleTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  scheduleSubtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: 24,
    fontWeight: '500',
  },
  scheduleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  scheduleOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  scheduleOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  scheduleCancelBtn: {
    marginTop: 20,
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  scheduleCancelText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
});
