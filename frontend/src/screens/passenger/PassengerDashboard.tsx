import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, FlatList, AppState, Linking
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
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
import { syncRideState } from '../../api/ride';
import BidCard from '../../components/BidCard';
import { stripeFrontendService } from '../../services/stripe';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import CarMarker from '../../components/CarMarker';
import SOSButton from '../../components/SOSButton';
import StatusBadge from '../../components/StatusBadge';
import ChatSheet from '../../components/ChatSheet';
import SearchingDriversView from '../../components/SearchingDriversView';
import { RatingModal } from '../../components/RatingModal';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import PriceInputSheet from '../../components/PriceInputSheet';
import { haversineKm, etaMinutes } from '../../utils/geo';
import { useCurrency } from '../../hooks/useCurrency';

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function PassengerDashboard() {
  const { user, logout } = useAuthStore();
  const navigation = useNavigation<any>();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const bottomSheetRef = useRef<BottomSheet>(null);
  
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { currency, formatPrice, convertToLocal, convertToUsd } = useCurrency();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const bidStylesFixed = React.useMemo(() => getBidStyles(theme), [theme]);

  // Trip state centralizado
  const { status: rideStatus, setStatus: setRideStatus, rideId: currentRideId, setRideContext, bids, receiveBid, resetFlow, setActiveRide, paymentMethod } = useRideFlowStore();
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [price, setPrice] = useState('');
  const [completedRide, setCompletedRide] = useState<any>(null);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [paymentAuthorizing, setPaymentAuthorizing] = useState<boolean>(false);
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
      const dist = haversineKm(
        location.coords.latitude, location.coords.longitude,
        selectedPlace.latitude, selectedPlace.longitude
      );
      setDistanceKm(Number(dist.toFixed(1)));
      // BUG 5 FIX: Factor determinístico basado en hora del día en vez de Math.random()
      const hour = new Date().getHours();
      const trafficMultiplier = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.4 : 1.0;
      const baseEta = Math.max(1, Math.round((dist / 40) * 60)); // 40 km/h avg
      setEstimatedTimeMin(Math.round(baseEta * trafficMultiplier));
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
              pickupLng: location.coords.longitude,
              dropoffLat: selectedPlace.latitude,
              dropoffLng: selectedPlace.longitude
            }
          });
          if (!active) return;
          if (res.data?.success) {
            setPricingMetadata(res.data.data.categories);
            const usdPrice = res.data.data.categories[vehicleCategory]?.recommendedPrice || 2;
            let localPrice = convertToLocal(usdPrice);
            if (promoDiscount) {
              if (promoDiscount.type === 'PERCENTAGE') {
                localPrice = localPrice * (1 - promoDiscount.value / 100);
              } else {
                localPrice = Math.max(10, localPrice - promoDiscount.value);
              }
            }
            setPrice(localPrice.toFixed(2));
          }
        } catch (e) {
          console.warn('Error fetching estimate:', e);
        }
      } else {
        setPrice('');
      }
    };
    fetchPrice();
    return () => { active = false; };
  }, [distanceKm, selectedPlace, location, vehicleCategory, currency, promoDiscount, convertToLocal]);

  const mapRef = useRef<MapRendererHandle>(null);
  const { pushLocation, stopTracking, driverTrackingState } = useDriverTracking(mapRef);
  
  const localVersion = useRef(0);
  // Removido: console.log de render count (producción)

  // Refs anti-stale-closure
  const currentRideIdRef = useRef<string | null>(null);
  useEffect(() => { currentRideIdRef.current = currentRideId; }, [currentRideId]);

  const checkLocationStatus = useCallback(async () => {
    let isMounted = true;
    try {
        setErrorMsg(null);
        // 1. Check if GPS is enabled on device
        const providerStatus = await Location.getProviderStatusAsync();
        if (!providerStatus.locationServicesEnabled) {
             setErrorMsg('GPS_DISABLED');
             return;
        }

        // 2. Request permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;
        if (status !== 'granted') { 
             setErrorMsg('PERMISSION_DENIED'); 
             return; 
        }

        // 3. Get initial location
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!isMounted) return;
        setLocation(loc);

        // 4. Watch position
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (newLoc) => { if (isMounted) setLocation(newLoc); }
        );
        return sub;
    } catch (e: any) {
        if (isMounted) setErrorMsg('SERVICE_ERROR');
        return null;
    }
  }, []);

  // ─── Socket setup y Location INIT ───────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let locationSubscription: Location.LocationSubscription | null = null;
    socketService.connect();

    // AppState Listener para Sincronía POST background (Fase API Re-Fetch)
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
       locationSubscription = sub;
    });

    return () => {
      isMounted = false;
      socketService.disconnect();
      locationSubscription?.remove();
      sub.remove();
    };
  }, [checkLocationStatus]);

  const [activeDriversCount, setActiveDriversCount] = useState<number>(0);
  const [showDriverBanner, setShowDriverBanner] = useState<boolean>(false);

  // --- EVENTOS SOCKET CENTRALIZADOS (EventManager) ---

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

  // CORRECCIÓN 9: Si no hay conductores, avisarle al pasajero
  useRideSocketEvent('no_drivers_available', useCallback((data: any) => {
    Alert.alert('Sin conductores', data.message);
    resetFlow(); // Vuelve al estado IDLE
    setPrice(''); // Limpiar precio propuesto
  }, []));

  useRideSocketEvent('trip_bid_received', useCallback((updatedRide: any) => {
    if (updatedRide.bids) {
      const isFirstBid = useRideFlowStore.getState().bids.length === 0;
      if (isFirstBid) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const pending = updatedRide.bids
        .filter((b: any) => b.status === 'PENDING')
        .sort((a: any, b: any) => a.price - b.price);
      
      // Update directly to the store for each bid
      pending.forEach((b: any) => receiveBid(b));
    }
  }, []));

  useRideSocketEvent('trip_state_changed', useCallback((updatedRide) => {
    const { status, version } = updatedRide;
    if (version && version <= localVersion.current) return;
    if (version) localVersion.current = version;

    // Cada estado del backend se mapea 1:1 a un estado UI distinto
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
          // No need for state hacks anymore - compute scalar explicit values
          const finalPrice = updatedRide?.bids?.find((b: any) => b.status === 'ACCEPTED')?.price
            ?? updatedRide?.proposedPrice
            ?? '—';
          
          stopTracking();
          resetFlow();
          setPrice('');
          setAcceptingBidId(null);
          setSelectedPlace(null);
          bottomSheetRef.current?.snapToIndex(1);
          
          // Use robust navigation push for production grade persistence state
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
      // Usamos el hook purificado para Queue + Lerp Nativo + Watchdog Timeline
      pushLocation(locData.latitude, locData.longitude);
  }, [pushLocation]));

  useRideSocketEvent('rideError', useCallback((error) => {
    Alert.alert('Error', error.message);
    resetFlow();
    setAcceptingBidId(null);
  }, []));

  // LAUNCH 7 FIX: Escuchar eventos de driver no escuchados previamente
  useRideSocketEvent('driver_warning', useCallback((data: any) => {
    Alert.alert(
      '⚠️ Aviso del conductor',
      data?.message || 'El conductor reporta un problema en la ruta.'
    );
  }, []));

  useRideSocketEvent('driver_disconnected', useCallback((data: any) => {
    Alert.alert(
      '📡 Conductor desconectado',
      'Se perdió la conexión con el conductor. Si persiste, contacta a soporte.',
      [
        { text: 'OK', style: 'default' },
        { text: 'SOS', style: 'destructive', onPress: () => {
          // Se gestionará cuando el SOS esté integrado en la UI
        }},
      ]
    );
  }, []));

  useRideSocketEvent('rating_submitted', useCallback(({ newAvg }) => {
    Alert.alert('¡Gracias!', `Tu calificación fue enviada. Rating del conductor: ${newAvg} ★`);
  }, []));

  useRideSocketEvent('ride:cancelled', useCallback(({ rideId }) => {
    // Cuando el chofer cancela la asignación
    stopTracking();
    resetFlow();
    setPrice('');
    setAcceptingBidId(null);
    setSelectedPlace(null);
    setDistanceKm(0);
    setEstimatedTimeMin(0);
    socketService.setRideRoom(null);
    bottomSheetRef.current?.snapToIndex(1);
    Alert.alert('Viaje Cancelado', 'El conductor ha cancelado el viaje. Puedes solicitar uno nuevo.');
  }, [stopTracking]));

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleRequestRide = useCallback(async (finalPrice: number, finalCategory: any) => {
    if (!user?.avatarUrl && !user?.profilePhoto) {
        Alert.alert(
            'Foto Obligatoria',
            'Por seguridad, debes subir una foto de perfil antes de pedir un viaje.',
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
      // 'rideRequestCreated' socket event will update status
    } catch (error: any) {
        Alert.alert('Error de conexión', error.message);
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
           
           if (paymentMethod === 'CARD') {
             // CORRECCIÓN 3: Stripe Payment Sheet real
             const stripeRes = await stripeFrontendService.createPaymentIntent(currentRideId, bidId, currency);
             if (stripeRes.state === 'error') throw new Error(stripeRes.error || 'Fallo al retener fondos en tarjeta.');

             const { error: initError } = await initPaymentSheet({
               paymentIntentClientSecret: stripeRes.clientSecret as string,
               merchantDisplayName: 'B-Ride',
               applePay: { merchantCountryCode: 'US' },
               googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
               defaultBillingDetails: { name: user?.name || '' },
             });
             if (initError) throw new Error(initError.message);

             const { error: presentError } = await presentPaymentSheet();
             if (presentError) {
               // Usuario canceló el payment sheet — no emitir socket
               setAcceptingBidId(null);
               setPaymentAuthorizing(false);
               return;
             }
           }
           // Para CASH no hay payment sheet, emitir directamente

           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
           await socketService.emitWithAck('trip_accept_bid', {
             rideId: currentRideId,
             passengerId: user?._id,
             bidId,
             driverId,
             paymentMethod,
           });
       } catch (error: any) {
           Alert.alert('Transacción Detenida', error.message || 'No se pudo autorizar el pago.');
           setAcceptingBidId(null);
       } finally {
           setPaymentAuthorizing(false);
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
     } catch(e: any) {
        Alert.alert('Error promo', e.response?.data?.message || 'Código inválido.');
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
           Alert.alert('Viaje Programado', `Tu viaje ha sido programado para ${scheduledDate.toLocaleString()}`);
           handleCancelRequest(); // Resetea form
       }
    } catch (e: any) {
       Alert.alert('Error al programar', e.response?.data?.message || 'Algo salió mal');
    }
  };

  const openNavigation = useCallback(() => {
    if (!selectedPlace) return;
    const lat = selectedPlace.latitude;
    const lng = selectedPlace.longitude;
    const label = selectedPlace.displayName;
    const schemes = [
      `waze://?ll=${lat},${lng}&navigate=yes`,
      `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    ];

    Alert.alert(
      'Navegar',
      `¿Con qué app quieres navegar a ${label}?`,
      [
        {
          text: 'Waze',
          onPress: () => Linking.openURL(schemes[0]).catch(() =>
            Linking.openURL(schemes[2])
          ),
        },
        {
          text: 'Google Maps',
          onPress: () => Linking.openURL(schemes[1]).catch(() =>
            Linking.openURL(schemes[2])
          ),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  }, [selectedPlace]);

  const handleRateDriver = useCallback(async (score: number, comment: string) => {
    if (completedRide) {
       try {
           Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
           await socketService.emitWithAck('rate_driver', {
             rideId: completedRide._id,
             driverId: completedRide.driver?._id ?? completedRide.driver,
             fromUserId: user?._id,
             score,
           });
           if (comment) {
             await client.post(`/rides/${completedRide._id}/comment`, { text: comment });
           }
       } catch (error: any) {
           Alert.alert('Error Calificando', error.message);
       }
    }
    setCompletedRide(null);
  }, [completedRide, user]);

  const handleSkipRating = useCallback(() => setCompletedRide(null), []);

  const isSearching =
    rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING';
  const isActiveRide = rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' || rideStatus === 'IN_PROGRESS' || rideStatus === 'ACTIVE' || rideStatus === 'MAPPED';

  // El bid más barato es el índice 0 (ya vienen ordenados por precio asc)
  const bestBidId = bids.length > 0 ? bids[0]._id : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Rating modal post-viaje */}
      <RatingModal
        visible={!!completedRide}
        targetName={completedRide?.driver?.name ?? 'el conductor'}
        onSubmit={handleRateDriver}
        onSkip={handleSkipRating}
      />



      {/* Header flotante superior */}
      <View style={styles.floatingHeader}>
        {/* Avatar del usuario */}
        <TouchableOpacity
          style={styles.headerAvatar}
          onPress={() => navigation.navigate('PassengerProfile')}
          activeOpacity={0.8}
        >
          {user?.profilePhoto || user?.avatarUrl ? (
            <Image
              source={{ uri: user.profilePhoto || user.avatarUrl }}
              style={styles.headerAvatarImg}
            />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarInitials}>
                {user?.name?.charAt(0)?.toUpperCase() ?? 'U'}
              </Text>
            </View>
          )}
          {/* Indicador online */}
          <View style={styles.headerOnlineDot} />
        </TouchableOpacity>

        {/* Saludo */}
        <View style={styles.headerGreeting}>
          <Text style={styles.headerGreetingText}>Hola, {user?.name?.split(' ')[0] ?? 'Usuario'}</Text>
          <Text style={styles.headerGreetingSubtext}>¿A dónde vas hoy?</Text>
        </View>

        {/* Notificaciones placeholder */}
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {location ? (
        <MapRenderer
          ref={mapRef}
          latitude={location.coords.latitude}
          longitude={location.coords.longitude}
          title={t('general.locating')}
          destinationCoordinate={selectedPlace ? { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude } : undefined}
        />
      ) : (
        <View style={styles.loaderContainer}>
          {errorMsg ? (
            <View style={{alignItems: 'center', justifyContent: 'center', padding: 30, backgroundColor: theme.colors.surface, borderRadius: 20, marginHorizontal: 20}}>
                <Ionicons name="location-off" size={48} color={theme.colors.error} style={{marginBottom: 10}} />
                <Text style={{...theme.typography.title, color: theme.colors.text, textAlign: 'center', marginBottom: 8}}>
                   {errorMsg === 'GPS_DISABLED' ? t('errors.locationNotReady') : 
                    errorMsg === 'PERMISSION_DENIED' ? t('general.locationDenied') : t('general.locationFailed')}
                </Text>
                <Text style={{...theme.typography.body, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 20}}>
                   {errorMsg === 'GPS_DISABLED' ? t('errors.locationNotReadyMsg') : 
                    errorMsg === 'PERMISSION_DENIED' ? t('general.locationDenied') : 
                    t('general.locationFailed')}
                </Text>
                <TouchableOpacity 
                   style={{backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: theme.borderRadius.full}}
                   onPress={checkLocationStatus}
                >
                   <Text style={{color: theme.colors.primaryText, fontWeight: '700', fontSize: 16}}>{t('history.retry')}</Text>
                </TouchableOpacity>
            </View>
          ) : (
            <Loader label={t('general.locating')} />
          )}
        </View>
      )}

      {showDriverBanner && (
        <View style={styles.topDriverBanner}>
          <Text style={styles.topDriverBannerText}>{t('general.bidsReceived', { count: '' }).replace('0 ', '').replace('1 ', '')}...</Text>
        </View>
      )}

      {/* Main BottomSheet — dinámico aislado, sin re-render del MapView */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={[
          '12%',
          isSearching ? '75%' : isActiveRide ? '35%' : '52%',
          '90%',
        ]}
        backgroundStyle={{ backgroundColor: theme.colors.surface, borderRadius: 36 }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border, width: 44, height: 4 }}
        style={theme.shadows.lg}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* ── IDLE: formulario de solicitud ── */}
        {rideStatus === 'IDLE' && (
          <View style={{ paddingHorizontal: theme.spacing.xl }}>
            {activeDriversCount === 0 && (
              <View style={styles.idleStatusBanner}>
                <Ionicons name="moon" size={16} color={theme.colors.textMuted} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.idleStatusBannerText}>{t('driver.offlineTitle')}</Text>
                  <Text style={styles.idleStatusBannerSubtext}>{t('driver.tryAgainLater')}</Text>
                </View>
              </View>
            )}
            <Text style={styles.cardHeader}>{t('form.whereAreYouGoing')}</Text>

            <View style={styles.formContainer}>
              <View style={styles.dotContainer}>
                <View style={styles.pickupDot} />
                <View style={styles.line} />
                <View style={styles.dropoffDot} />
              </View>
              <View style={styles.inputsSection}>
                <TextInput
                  style={styles.inputLocation}
                  placeholder={t('form.currentLocation')}
                  placeholderTextColor={theme.colors.text}
                  editable={false}
                />
                {/* Autocomplete integrado */}
                <AddressAutocomplete
                  placeholder={t('form.enterDestination')}
                  onSelect={(place) => setSelectedPlace(place)}
                  value={selectedPlace?.displayName}
                  userLat={location?.coords.latitude}
                  userLng={location?.coords.longitude}
                />
              </View>
            </View>

            <PaymentMethodSelector />

            {/* UX Improvement: Discretely toggle promo input instead of occupying 100% space by default */}
            <View style={{ marginBottom: 16, alignItems: 'center' }}>
                {!promoDiscount ? (
                  !promoInputOpen ? (
                    <TouchableOpacity onPress={() => setPromoInputOpen(true)}>
                       <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>+ Agregar Código Promo</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                        <TextInput 
                          style={[styles.inputLocation, { flex: 1, backgroundColor: theme.colors.surfaceHigh, paddingVertical: 8 }]} 
                          placeholder="Ingrese el código"
                          placeholderTextColor={theme.colors.textMuted}
                          value={promoCode}
                          onChangeText={text => setPromoCode(text.toUpperCase())}
                          autoCapitalize="characters"
                          autoFocus
                        />
                        <TouchableOpacity 
                           style={{ backgroundColor: theme.colors.surfaceHigh, paddingHorizontal: 16, borderRadius: theme.borderRadius.m, borderWidth: 1, borderColor: theme.colors.borderLight, justifyContent: 'center' }}
                           onPress={handleApplyPromo}
                           disabled={!promoCode || promoApplying}
                        >
                           {promoApplying ? (
                              <ActivityIndicator size="small" color={theme.colors.primary} />
                           ) : (
                              <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>Aplicar</Text>
                           )}
                        </TouchableOpacity>
                        <TouchableOpacity 
                           style={{ justifyContent: 'center', paddingHorizontal: 8 }}
                           onPress={() => setPromoInputOpen(false)}
                        >
                           <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                  )
                ) : (
                  <View style={{ backgroundColor: theme.colors.primaryLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                    <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Promo Aplicada: {promoCode}</Text>
                  </View>
                )}
            </View>

                <TouchableOpacity
                  style={[styles.requestButton, { width: '100%' }, (!selectedPlace || distanceKm > 100) && styles.requestButtonDisabled]}
                  onPress={() => setPriceSheetVisible(true)}
                  disabled={!selectedPlace || distanceKm > 100}
                >
                  <Text style={styles.requestButtonText}>
                    {selectedPlace ? t('form.searchDriver', {defaultValue: 'Ofrecer tarifa y buscar conductor'}) : t('form.selectDestination', {defaultValue: 'Selecciona un destino'})}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ alignSelf: 'center', paddingVertical: 8 }}
                  onPress={() => setScheduleModalVisible(true)}
                  disabled={!selectedPlace || distanceKm > 100}
                >
                  <Text style={[{ color: theme.colors.text, fontWeight: '600', fontSize: 16 }, (!selectedPlace || distanceKm > 100) && { opacity: 0.5 }]}>
                    Programar para después
                  </Text>
                </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── REQUESTING / REQUESTED / NEGOTIATING ── */}
        {isSearching && (
          <View style={{ paddingHorizontal: theme.spacing.xl }}>

            {/* States without bids */}
            {(rideStatus === 'REQUESTING' ||
              rideStatus === 'REQUESTED' ||
              rideStatus === 'SEARCHING' ||
              (rideStatus === 'NEGOTIATING' && bids.length === 0)) && (
              <>
              <SearchingDriversView
                activeDriversCount={activeDriversCount}
                onCancel={handleCancelRequest}
              />
              {/* Price raise stepper */}
              {price && Number(price) > 0 && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: 8 }}>
                    {t('form.adjustPrice')}
                  </Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: theme.colors.primary, marginBottom: 12 }}>
                    {formatPrice(convertToUsd(price))}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[5, 10, 15].map(add => (
                      <TouchableOpacity
                        key={add}
                        style={{
                          backgroundColor: theme.colors.primaryLight,
                          borderRadius: theme.borderRadius.pill,
                          paddingHorizontal: 20,
                          paddingVertical: 10,
                          borderWidth: 1,
                          borderColor: theme.colors.primary,
                        }}
                        onPress={() => {
                          const newPrice = (Number(price) + add).toFixed(2);
                          setPrice(newPrice);
                          if (currentRideId) {
                            socketService.emitWithAck('update_ride_price', {
                              rideId: currentRideId,
                              passengerId: user?._id,
                              newPrice: Number(newPrice),
                            }).catch(() => {});
                          }
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <Text style={{ color: theme.colors.primary, fontWeight: '700', fontSize: 15 }}>+${add}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              </>
            )}

            {/* NEGOTIATING with bids → bid list + cancel */}
            {rideStatus === 'NEGOTIATING' && bids.length > 0 && (
              <View style={styles.searchingContainer}>
                <View style={styles.searchingContent}>
                  <Text style={styles.statusTitle}>
                    {bids.length === 1
                      ? t('general.bidsReceived', { count: bids.length })
                      : t('general.bidsReceivedPlural', { count: bids.length })}
                  </Text>

                  {paymentAuthorizing && (
                    <View style={styles.authStripeBox}>
                      <Loader size="sm" color="#635BFF" />
                      <Text style={styles.authStripeText}>{t('general.holdingFunds')}</Text>
                    </View>
                  )}

                  <View style={{ marginTop: 8, width: '100%', paddingBottom: 20 }}>
                    {bids.map((item: any) => (
                      <BidCard
                        key={item._id}
                        bid={{...item, isProcessing: acceptingBidId === item._id}}
                        isBest={item._id === bestBidId}
                        pickupLat={location?.coords.latitude}
                        pickupLng={location?.coords.longitude}
                        onAccept={handleAcceptBid}
                      />
                    ))}
                  </View>
                </View>

                <TouchableOpacity style={styles.cancelRequestBtn} onPress={handleCancelRequest}>
                  <Text style={styles.cancelRequestBtnText}>{t('searching.cancel')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── ACTIVE: viaje en curso ── */}
        {isActiveRide && (
          <View style={styles.activeRideCardPassenger}>

            {/* Fase */}
            <View style={styles.activePhaseRow}>
              <View style={[styles.activePhasePill, {
                backgroundColor: rideStatus === 'IN_PROGRESS' ? theme.colors.successLight : theme.colors.primaryLight,
                borderColor: rideStatus === 'IN_PROGRESS' ? theme.colors.success : theme.colors.primary,
              }]}>
                <View style={[styles.activePhaseDot, {
                  backgroundColor: rideStatus === 'IN_PROGRESS' ? theme.colors.success : theme.colors.primary,
                }]} />
                <Text style={[styles.activePhaseText, {
                  color: rideStatus === 'IN_PROGRESS' ? theme.colors.success : theme.colors.primary,
                }]}>
                  {rideStatus === 'ARRIVED'     ? 'Tu conductor llegó' :
                   rideStatus === 'IN_PROGRESS' ? 'En camino a tu destino' :
                                                  'Conductor en camino'}
                </Text>
              </View>
            </View>

            {/* Destino */}
            <Text style={styles.activeDestTextPassenger} numberOfLines={2}>
              {rideStatus === 'IN_PROGRESS'
                ? `→ ${selectedPlace?.displayName ?? selectedPlace?.address ?? 'Tu destino'}`
                : 'Tu conductor se dirige hacia ti'}
            </Text>

            {/* Botones de acción */}
            <View style={styles.activePassengerActions}>
              <TouchableOpacity style={styles.activeActionBtn} onPress={() => setChatVisible(true)}>
                <Ionicons name="chatbubble-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.activeActionText}>Chat</Text>
              </TouchableOpacity>

              {/* SOS */}
              <SOSButton rideId={currentRideId ?? ''} style={styles.sosInline} />

              <TouchableOpacity style={styles.activeActionBtn} onPress={() => {/* share */}}>
                <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.activeActionText}>Compartir</Text>
              </TouchableOpacity>
            </View>

          </View>
        )}
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Chat Sheet — flotante en 52%, no bloquea el mapa */}
      <ChatSheet
        rideId={currentRideId}
        myUserId={user?._id}
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
      />

      <Modal visible={scheduleModalVisible} transparent animationType="slide">
         <View style={styles.modalOverlay}>
            <View style={[styles.bottomSheet, { paddingBottom: 40 }]}>
                 <Text style={[styles.title, { marginBottom: 20 }]}>Programar Viaje</Text>
                 <TouchableOpacity style={styles.requestButton} onPress={() => handleScheduleRide(1)}>
                    <Text style={styles.requestButtonText}>En 1 hora</Text>
                 </TouchableOpacity>
                 <View style={{ height: 10 }} />
                 <TouchableOpacity style={styles.requestButton} onPress={() => handleScheduleRide(2)}>
                    <Text style={styles.requestButtonText}>En 2 horas</Text>
                 </TouchableOpacity>
                 <View style={{ height: 10 }} />
                 <TouchableOpacity style={styles.requestButton} onPress={() => handleScheduleRide(24)}>
                    <Text style={styles.requestButtonText}>Mañana a esta hora</Text>
                 </TouchableOpacity>
                 <View style={{ height: 10 }} />
                 <TouchableOpacity style={[styles.requestButton, { backgroundColor: theme.colors.surfaceHigh }]} onPress={() => setScheduleModalVisible(false)}>
                    <Text style={[styles.requestButtonText, { color: theme.colors.text }]}>Cancelar</Text>
                 </TouchableOpacity>
            </View>
         </View>
      </Modal>
      <PriceInputSheet
        visible={priceSheetVisible}
        onClose={() => setPriceSheetVisible(false)}
        onConfirm={handleRequestRide}
        categoryOptions={categoryOptions}
        loadingQuotes={loadingQuotes}
        destAddress={selectedPlace?.displayName || selectedPlace?.address}
      />
    </KeyboardAvoidingView>
  );
}

// ─── BidCard styles ──────────────────────────────────────────────────────────
const getBidStyles = (theme: Theme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    marginBottom: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  bestCard: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: theme.colors.primaryLight,
  },
  bestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  bestBadgeText: {
    color: theme.colors.primaryText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBest: {
    backgroundColor: theme.colors.primary,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  info: {
    flex: 1,
  },
  driverName: {
    ...theme.typography.body,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  ratingValue: {
    ...theme.typography.bodyMuted,
    fontSize: 12,
    marginLeft: 2,
  },
  eta: {
    ...theme.typography.bodyMuted,
    fontSize: 12,
    color: theme.colors.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  price: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.success,
  },
  priceBest: {
    color: theme.colors.primary,
  },
  acceptBtn: {
    backgroundColor: theme.colors.text,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: theme.borderRadius.pill,
    minWidth: 90,
    alignItems: 'center',
  },
  acceptBtnDisabled: {
    opacity: 0.7,
  },
  acceptBtnBest: {
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  acceptBtnText: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
});



// ─── Main styles ─────────────────────────────────────────────────────────────
const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  floatingHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 16,
    left: 16, right: 16, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: theme.colors.borderLight,
  },
  headerAvatar: { position: 'relative' },
  headerAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1.5, borderColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarInitials: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  headerOnlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: theme.colors.success,
    borderWidth: 1.5, borderColor: theme.colors.background,
  },
  headerGreeting: { flex: 1 },
  headerGreetingText: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  headerGreetingSubtext: { fontSize: 11, color: theme.colors.textMuted },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: theme.colors.surfaceHigh,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  
  activeRideCardPassenger: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.l, margin: theme.spacing.m,
    padding: theme.spacing.l, borderWidth: 1, borderColor: theme.colors.border,
  },
  activePhaseRow: { marginBottom: theme.spacing.m },
  activePhasePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: theme.borderRadius.pill, borderWidth: 1.5,
  },
  activePhaseDot: { width: 6, height: 6, borderRadius: 3 },
  activePhaseText: { fontSize: 12, fontWeight: '700' },
  activeDestTextPassenger: { ...theme.typography.title, fontSize: 16, marginBottom: theme.spacing.l },
  activePassengerActions: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-around',
  },
  activeActionBtn: { alignItems: 'center', gap: 4, flex: 1 },
  activeActionText: { ...theme.typography.caption, color: theme.colors.textSecondary, fontSize: 11 },
  sosInline: { width: 56, height: 56, borderRadius: 28 },

  headerOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20, right: 20,
    zIndex: 10,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.m,
    borderRadius: theme.borderRadius.l,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  logoutButton: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.pill,
  },
  logoutText: { ...theme.typography.body, fontWeight: '600', color: theme.colors.error },
  title: { ...theme.typography.header, fontSize: 22 },
  subtitle: { ...theme.typography.bodyMuted, fontSize: 14, marginBottom: 2 },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  loaderText: { ...theme.typography.bodyMuted, marginTop: theme.spacing.m },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  biddingCard: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? theme.spacing.xxxl : theme.spacing.xl,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 24,
  },
  statusCard: { alignItems: 'center' },
  dragHandle: { width: 48, height: 5, backgroundColor: theme.colors.border, borderRadius: 3, alignSelf: 'center', marginBottom: theme.spacing.l },
  cardHeader: { ...theme.typography.title, marginBottom: theme.spacing.l },
  formContainer: { flexDirection: 'row', marginBottom: theme.spacing.l },
  dotContainer: { alignItems: 'center', paddingTop: 16, marginRight: theme.spacing.m },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.primary },
  line: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginVertical: 4 },
  dropoffDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.text },
  inputsSection: { flex: 1, gap: 8 },
  inputLocation: {
    backgroundColor: 'transparent',
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    fontWeight: '500',
  },
  pricingSection: { marginBottom: theme.spacing.xl },
  pricingCard: {
    backgroundColor: theme.colors.surfaceHigh,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pricingMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 8,
  },
  pricingInfo: {
    flexDirection: 'column',
  },
  pricingDetails: {
    alignItems: 'flex-end',
  },
  suggestedPriceLabel: {
    ...theme.typography.label,
    marginBottom: 2,
    color: theme.colors.textSecondary,
  },
  suggestedPriceValue: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  pricingSubtext: {
    ...theme.typography.bodyMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  tripDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  tripDataText: {
    ...theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pricingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adjustPriceLabel: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
  },
  priceRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.s,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: 100,
  },
  currencyCompact: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginRight: 4,
  },
  priceInputCompact: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    paddingVertical: 6,
  },
  noDriversBadge: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 140 : 120,
    alignSelf: 'center',
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.pill,
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 10,
  },
  noDriversBadgeText: {
    ...theme.typography.label,
    color: theme.colors.textSecondary,
    fontSize: 12,
  },

  requestButton: {
    backgroundColor: theme.colors.primary,
    padding: 18,
    borderRadius: theme.borderRadius.pill,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  requestButtonDisabled: {
    backgroundColor: theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  requestButtonText: { ...theme.typography.button, fontSize: 18 },
  statusTitle: { ...theme.typography.header, color: theme.colors.text, marginBottom: theme.spacing.s, textAlign: 'center' },
  statusText: { ...theme.typography.body, textAlign: 'center' },
  infoText: { ...theme.typography.bodyMuted, textAlign: 'center', marginTop: theme.spacing.m },
  searchingContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 24,
    paddingBottom: 32,
  },
  searchingContent: {
    width: '100%',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  searchingTitle: {
    ...theme.typography.title,
    textAlign: 'center',
    marginTop: theme.spacing.l,
    marginBottom: theme.spacing.xs,
    color: theme.colors.text,
  },
  searchingSubtitle: {
    ...theme.typography.bodyMuted,
    textAlign: 'center',
    fontSize: 14,
  },
  loaderWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cancelRequestBtn: {
    marginTop: theme.spacing.m,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 28,
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
  authStripeBox: {
    backgroundColor: theme.colors.surfaceHigh, 
    borderColor: theme.colors.primary, 
    borderWidth: 1, 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: theme.borderRadius.m,
    marginBottom: 8
  },
  authStripeText: {
    marginLeft: 10,
    color: theme.colors.primary,
    fontWeight: '600',
    fontSize: 14
  },
  chatBtn: {
    marginTop: theme.spacing.l,
    backgroundColor: theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: 'center',
  },
  chatBtnText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  topDriverBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
    borderRadius: theme.borderRadius.s,
    padding: 16,
    zIndex: 100,
    ...theme.shadows.md,
  },
  topDriverBannerText: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.text,
  },
  idleStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceHigh,
    padding: 12,
    borderRadius: theme.borderRadius.m,
    marginBottom: 16,
  },
  idleStatusBannerText: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  idleStatusBannerSubtext: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
});
