import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  Image,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withRepeat,
  interpolateColor, Easing,
} from 'react-native-reanimated';
import PulsingDot from '../../components/PulsingDot';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';

import client from '../../api/client';

import { useAuthStore } from '../../store/authStore';
import socketService from '../../services/socket';
import { useRideSocketEvent } from '../../services/EventManager';
import { stripeFrontendService } from '../../services/stripe';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { type Theme } from '../../theme';
import MapRenderer from '../../components/MapRenderer';
import Button from '../../components/Button';
import Loader from '../../components/Loader';
import StatusBadge from '../../components/StatusBadge';
import ChatSheet from '../../components/ChatSheet';
import { RatingModal } from '../../components/RatingModal';
import { haversineKm } from '../../utils/geo';
import { geohashEncode } from '../../utils/geo';
import { useCurrency } from '../../hooks/useCurrency';
import { Ionicons } from '@expo/vector-icons';

// ─── TIPOS ────────────────────────────────────────────────────────────────────
type TripPhase = 'IDLE' | 'INCOMING' | 'BID_SENT' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS';

export default function DriverDashboard() {
  const { user, logout } = useAuthStore();
  const { formatPrice, convertToLocal, convertToUsd } = useCurrency();

  // ── Estado de conducción ──────────────────────────────────────────────────
  const [isOnline, setIsOnline]               = useState(false);
  const [location, setLocation]               = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(true);

  // ── Máquina de estados del viaje ─────────────────────────────────────────
  const [phase, setPhase]                     = useState<TripPhase>('IDLE');
  const [incomingRide, setIncomingRide]       = useState<any>(null);
  const [activeRide, setActiveRide]           = useState<any>(null);
  const [chatVisible, setChatVisible]         = useState(false);
  const [completedRide, setCompletedRide]     = useState<any>(null);

  // ── Refs anti-stale-closure ───────────────────────────────────────────────
  const isOnlineRef  = useRef(false);
  const activeRideRef = useRef<any>(null);
  const locationRef  = useRef<Location.LocationObject | null>(null);

  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  useEffect(() => { locationRef.current = location; }, [location]);

  // Ref para geohash anterior (BUG 4)
  const lastGeoHashRef = useRef<string | null>(null);

  // ── BottomSheet Ref ───────────────────────────────────────────────────────
  const sheetRef = useRef<BottomSheet>(null);
  
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  // ── Animación de entrada de nuevo viaje ──────────────────────────────────
  const incomingScale   = useSharedValue(0.85);
  const incomingOpacity = useSharedValue(0);

  const animateIncomingIn = useCallback(() => {
    incomingOpacity.value = withTiming(1,  { duration: 200 });
    incomingScale.value   = withSpring(1,  { damping: 14, stiffness: 200 });
  }, []);

  const animateIncomingOut = useCallback((cb?: () => void) => {
    incomingOpacity.value = withTiming(0, { duration: 150 });
    incomingScale.value   = withTiming(0.92, { duration: 150 });
    if (cb) setTimeout(cb, 160);
  }, []);

  const incomingAnimStyle = useAnimatedStyle(() => ({
    opacity:   incomingOpacity.value,
    transform: [{ scale: incomingScale.value }],
  }));

  // MÓDULO 1: Valores animados para Toggle ONLINE
  const toggleScale  = useSharedValue(1);
  const toggleGlow   = useSharedValue(0);
  const pulseOnline  = useSharedValue(1);

  // MÓDULO 2: Stats del día
  const [todayTrips, setTodayTrips] = useState<number>(0);
  const [todayEarnings, setTodayEarnings] = useState<number>(0);

  // Pulso cuando está online y fetch earnings
  useEffect(() => {
    if (isOnline) {
      toggleGlow.value  = withTiming(1, { duration: 400 });
      pulseOnline.value = withRepeat(
        withSequence(withTiming(1.08, { duration: 1200 }), withTiming(1, { duration: 1200 })),
        -1, true
      );
      client.get('/drivers/earnings').then(res => {
        if (res.data?.success) {
          setTodayTrips(res.data.todayRides ?? 0);
          setTodayEarnings(res.data.todayEarnings ?? 0);
        }
      }).catch(() => {});
    } else {
      toggleGlow.value  = withTiming(0, { duration: 300 });
      pulseOnline.value = withTiming(1, { duration: 300 });
    }
  }, [isOnline]);

  const toggleBgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      toggleGlow.value, [0, 1],
      [theme.colors.surfaceHigh, theme.colors.primary]
    ),
    transform: [{ scale: pulseOnline.value }],
  }));
  const toggleBorderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      toggleGlow.value, [0, 1],
      [theme.colors.border, theme.colors.primary]
    ),
  }));

  // ── Socket + GPS Setup (solo mount) ──────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let locationSubscription: Location.LocationSubscription | null = null;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;
        if (status !== 'granted') { setErrorMsg(t('driver.locationDenied')); return; }

        const loc = await Location.getCurrentPositionAsync({});
        if (!isMounted) return;
        setLocation(loc);

        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
          (newLoc) => {
            if (!isMounted) return;
            setLocation(newLoc);
          }
        );
      } catch (err: unknown) {
        if (isMounted) {
            console.error('[GPS Error]', err);
            setErrorMsg(t('driver.locationDenied', { defaultValue: 'GPS fallback: revisa tus permisos para geolocalización o señal débil.' }));
        }
      }
    })();

    return () => {
      isMounted = false;
      if (locationSubscription) {
          locationSubscription.remove();
      }
      // FIX-14: solo emitir OFFLINE si no hay viaje activo en curso
      if (!activeRideRef.current) {
        socketService.getSocket()?.emit('setDriverStatus', { userId: user?._id, status: 'OFFLINE' });
      }
    };
  }, [user?._id]);

  // BUG 4 FIX: useEffect 1 — Solo para driver:join (cuando cambia la celda geohash)
  useEffect(() => {
    if (!isOnline || !location) return;

    const lat = location.coords?.latitude;
    const lng = location.coords?.longitude;
    if (lat == null || lng == null) return;

    const currentHash = geohashEncode(lat, lng, 5);
    if (currentHash !== lastGeoHashRef.current) {
      lastGeoHashRef.current = currentHash;
      const socket = socketService.getSocket();
      if (socket) {
        if (__DEV__) console.log("[SOCKET] Emitting driver:join (celda cambió)");
        socket.emit('driver:join', { lat, lng });
      }
    }
  }, [location, isOnline]);

  // BUG 4 FIX: useEffect 2 — Solo para updateLocation (cada tick GPS)
  useEffect(() => {
    if (!isOnline || !location) return;

    const lat = location.coords?.latitude;
    const lng = location.coords?.longitude;
    if (lat == null || lng == null) return;

    if (__DEV__) console.log("[LOCATION]", lat, lng);

    const socket = socketService.getSocket();
    if (socket) {
      socket.emit('updateLocation', {
        driverId:    user?._id,
        latitude:    lat,
        longitude:   lng,
        passengerId: activeRide?.passenger?._id,
      });
    }

    // BUG 10: Guardar ubicación para re-emisión de driver:join tras reconexión
    socketService.setLastKnownDriverLocation(lat, lng);
  }, [location, isOnline, user?._id, activeRide?.passenger?._id]);

  // ── Bloque 1: Onboarding y Validación de Conductor ────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const isApproved = user?.approvalStatus === 'APPROVED' || user?.driverApprovalStatus === 'APPROVED';
        setOnboardingComplete(isApproved);
        if (!isApproved) {
           setIsOnline(false); // Forzar offline si no está aprobado
        }
      } catch {
        setOnboardingComplete(false);
      }
    })();
  }, [user]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOnline || !user?._id) return;
    const interval = setInterval(() => {
      socketService.getSocket()?.emit('driver_heartbeat', {
        driverId: user._id,
        rideId:   activeRideRef.current?._id,
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [isOnline, user?._id]);

  // ── Socket Events ─────────────────────────────────────────────────────────
  // [MODIFICADO] Escuchar 'ride:incoming' y devolver el ACK al backend para la métrica
  useRideSocketEvent('ride:incoming', useCallback(async (ride, ack) => {
    if (__DEV__) console.log(`[DRIVER] ride:incoming`, ride?._id);
    if (!isOnlineRef.current || activeRideRef.current || !ride?._id) return;
    
    // Enriquecer el ride con datos del pasajero si no vienen populados
    let enrichedRide = ride;
    if (!ride.passenger?.name) {
      try {
        const res = await client.get(`/rides/${ride._id}/details`);
        if (res.data?.success) enrichedRide = res.data.data;
      } catch (e: unknown) {
        // Continuar con datos parciales
      }
    }
    
    setIncomingRide(enrichedRide);
    setPhase('INCOMING');
    setTimeout(animateIncomingIn, 30);
    if (typeof ack === 'function') ack({ received: true, driverId: user?._id });
  }, [animateIncomingIn, user?._id]));

  // FIX-A09: Timer de 30s — auto-dismiss de INCOMING si el conductor no reacciona
  useEffect(() => {
    if (phase !== 'INCOMING') return;
    const timer = setTimeout(() => {
      if (__DEV__) console.log('[DRIVER] INCOMING timeout: auto-ignorando ride sin respuesta');
      animateIncomingOut(() => {
        setIncomingRide(null);
        setPhase('IDLE');
      });
    }, 30000);
    return () => clearTimeout(timer);
  }, [phase, animateIncomingOut]);

  // Mantener compatibilidad si se emite por el MatchingService en la anterior version
  useRideSocketEvent('new_trip', useCallback((ride) => {
    if (isOnlineRef.current && !activeRideRef.current) {
        setIncomingRide(ride);
        setPhase('INCOMING');
        setTimeout(animateIncomingIn, 30);
    }
  }, [animateIncomingIn]));

  // Passenger raised their price — update the incoming ride card in real-time
  useRideSocketEvent('ride_price_updated', useCallback(({ rideId, newPrice }) => {
    setIncomingRide((prev: any) => {
      if (!prev || prev._id !== rideId) return prev;
      return { ...prev, proposedPrice: newPrice };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []));

  useRideSocketEvent('trip_accepted', useCallback((ride) => {
    setIncomingRide(null);
    setActiveRide(ride);
    setPhase('ACCEPTED');
    sheetRef.current?.snapToIndex(1);
    Alert.alert(t('driver.auctionWon'), t('driver.auctionWonMsg'));

    if (locationRef.current) {
      socketService.emitWithAck('updateLocation', {
        driverId:    user?._id,
        latitude:    locationRef.current.coords.latitude,
        longitude:   locationRef.current.coords.longitude,
        passengerId: ride.passenger._id,
        rideId:      ride._id,
      }).catch(() => {});
    }
  }, [user?._id]));

  useRideSocketEvent('trip_rejected', useCallback(({ rideId }) => {
    setIncomingRide((prev: any) => (prev?._id === rideId ? null : prev));
    setPhase('IDLE');
  }, []));

  // Dedicated cancellation listener — PRODUCTION FIX
  // Ensures driver IMMEDIATELY clears state even if trip_state_changed is delayed
  useRideSocketEvent('ride:cancelled', useCallback(({ rideId }) => {
    if (__DEV__) console.log(`[DRIVER] ride:cancelled recibido para ride: ${rideId}`);
    animateIncomingOut(() => {
      setIncomingRide(null);
      setActiveRide(null);
      setPhase('IDLE');
      socketService.setRideRoom(null);
      sheetRef.current?.close();
    });
    Alert.alert(t('driver.rideCancelled'), t('driver.rideCancelledMsg'));
  }, [animateIncomingOut]));

  useRideSocketEvent('trip_state_changed', useCallback((updatedRide) => {
    if (updatedRide.status === 'CANCELLED') {
      animateIncomingOut(() => {
        setActiveRide(null);
        setIncomingRide(null);
        setPhase('IDLE');
        socketService.setRideRoom(null);
        sheetRef.current?.close();
      });
      Alert.alert(t('driver.rideCancelled'), t('driver.rideCancelledMsg'));
    }
  }, [animateIncomingOut]));

  useRideSocketEvent('rating_submitted', useCallback(({ newAvg }) => {
    Alert.alert(t('driver.ratingThanks'), t('driver.ratingThanksMsg', { avg: newAvg }));
  }, []));

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openNavigation = useCallback((lat: number, lng: number, label: string) => {
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
  }, []);

  const toggleOnline = useCallback(async () => {
    if (!onboardingComplete) {
      Alert.alert(t('driver.financialRequired'), t('driver.financialRequiredMsg'));
      return;
    }
    if (activeRideRef.current) {
      Alert.alert(t('driver.activeTrip'), t('driver.activeTripMsg'));
      return;
    }
    const next = !isOnline;
    try {
      await socketService.emitWithAck('setDriverStatus', {
        userId: user?._id,
        status: next ? 'AVAILABLE' : 'OFFLINE',
      });
      setIsOnline(next);
      // Nota: La emisión de actualización de location y driver:join
      // ahora está manejada por un useEffect estable cuando isOnline y location son válidos.
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de red';
      Alert.alert(t('driver.networkError'), msg);
    }
  }, [user, isOnline, onboardingComplete]);

  const handleBid = useCallback(async (priceAdditive = 0) => {
    if (!incomingRide) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Multi-currency: El precio que vemos y operamos está en moneda local. Se debe enviar en USD al server.
    const baseLocal = convertToLocal(incomingRide.proposedPrice);
    const newLocalPrice = baseLocal + priceAdditive;
    const finalPriceUsd = convertToUsd(newLocalPrice);

    setPhase('BID_SENT');
    try {
      await socketService.emitWithAck('trip_bid', {
        rideId:      incomingRide._id,
        driverId:    user?._id,
        price:       finalPriceUsd,
        passengerId: incomingRide.passenger._id,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al enviar oferta';
      Alert.alert(t('driver.auctionFailed'), msg);
      setPhase('INCOMING');
    }
  }, [incomingRide, user]);

  const handleIgnore = useCallback(() => {
    animateIncomingOut(() => {
      setIncomingRide(null);
      setPhase('IDLE');
    });
  }, [animateIncomingOut]);

  const handleAdvance = useCallback(async (nextStatus: string) => {
    if (!activeRide) return;
    try {
      await socketService.emitWithAck('update_trip_state', {
        rideId:      activeRide._id,
        driverId:    user?._id,
        passengerId: activeRide.passenger._id,
        nextStatus,
      });
      if (nextStatus === 'COMPLETED' || nextStatus === 'CANCELLED') {
        if (nextStatus === 'COMPLETED') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const finishedRide = activeRide;
        setActiveRide(null);
        setPhase('IDLE');
        socketService.setRideRoom(null);
        if (nextStatus === 'COMPLETED') {
            setCompletedRide(finishedRide);
        }
      } else {
        setActiveRide({ ...activeRide, status: nextStatus });
        setPhase(nextStatus as TripPhase);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error de red';
      Alert.alert(t('driver.networkError'), msg);
    }
  }, [activeRide, user]);

  const handleRatePassenger = useCallback(async (score: number, comment: string) => {
    if (completedRide) {
       try {
           Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
           await socketService.emitWithAck('rate_passenger', {
             rideId: completedRide._id,
             passengerId: completedRide.passenger?._id ?? completedRide.passenger,
             fromUserId: user?._id,
             score,
           });
           if (comment) {
               await client.post(`/rides/${completedRide._id}/comment`, { text: comment });
           }
       } catch (error: unknown) {
           Alert.alert(t('driver.ratingError'), (error as any).message);
       }
    }
    setCompletedRide(null);
  }, [completedRide, user]);

  const handleSkipRating = useCallback(() => setCompletedRide(null), []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const incomingMetrics = React.useMemo(() => {
    if (!incomingRide || !location) return { distToPassenger: null, tripDist: null, estTime: null, estEarnings: null };
    const pickup = incomingRide.pickupLocation;
    const dropoff = incomingRide.dropoffLocation;
    const driverLat = location.coords.latitude;
    const driverLng = location.coords.longitude;
    const pLat = pickup?.latitude ?? pickup?.lat;
    const pLng = pickup?.longitude ?? pickup?.lng;
    const dLat = dropoff?.latitude ?? dropoff?.lat;
    const dLng = dropoff?.longitude ?? dropoff?.lng;
    
    const distToPassenger = (pLat) ? haversineKm(driverLat, driverLng, pLat, pLng) : null;
    const tripDist = (pLat && dLat) ? haversineKm(pLat, pLng, dLat, dLng) : null;
    const estTime = tripDist ? Math.max(1, Math.round((tripDist / 35) * 60)) : null;
    const estEarnings = incomingRide.proposedPrice ? (Number(incomingRide.proposedPrice) * 0.80) : null;
    
    return { distToPassenger, tripDist, estTime, estEarnings };
  }, [incomingRide, location]);

  const activeMetrics = React.useMemo(() => {
    if (!activeRide || !location || phase === 'IDLE') return { dist: null, eta: null };
    const target = phase === 'IN_PROGRESS' ? activeRide.dropoffLocation : activeRide.pickupLocation;
    const tLat = target?.latitude ?? target?.lat;
    const tLng = target?.longitude ?? target?.lng;
    const myLat = location.coords.latitude;
    const myLng = location.coords.longitude;
    
    if (!tLat || !myLat) return { dist: null, eta: null };
    const dist = haversineKm(myLat, myLng, tLat, tLng);
    const eta = Math.max(1, Math.round((dist / 30) * 60));
    return { dist, eta };
  }, [activeRide, location, phase]);

  const snapPoints = phase === 'IDLE'
    ? ['10%']
    : phase === 'INCOMING' || phase === 'BID_SENT'
    ? ['10%', '70%', '92%']
    : ['10%', '38%', '60%']; // ACTIVE phases — compact

  const hasActiveSheet = phase !== 'IDLE' || isOnline;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <RatingModal
        visible={!!completedRide}
        targetName={completedRide?.passenger?.name ?? 'el pasajero'}
        isDriver
        onSubmit={handleRatePassenger}
        onSkip={handleSkipRating}
      />

      {/* ── MAPA: capa base. Siempre full screen ── */}
      {location ? (
        <MapRenderer
          latitude={location.coords.latitude}
          longitude={location.coords.longitude}
          title="Mi Vehículo"
          isDriver={true}
          pickupCoordinate={activeRide?.pickupLocation ? { latitude: activeRide.pickupLocation.latitude, longitude: activeRide.pickupLocation.longitude } : undefined}
          dropoffCoordinate={activeRide?.dropoffLocation ? { latitude: activeRide.dropoffLocation.latitude, longitude: activeRide.dropoffLocation.longitude } : undefined}
          driverPhase={phase === 'ACCEPTED' || phase === 'ARRIVED' ? 'TO_PICKUP' : phase === 'IN_PROGRESS' ? 'TO_DESTINATION' : null}
        />
      ) : (
        <View style={styles.loaderScreen}>
          <Loader label={errorMsg ?? 'Obteniendo GPS...'} />
        </View>
      )}

      {/* ── HEADER FLOTANTE MÍNIMO ── */}
      <View style={styles.header}>
        {/* Estado + Nombre */}
        <View>
          <StatusBadge
            variant={isOnline ? 'online' : 'offline'}
            style={{ marginBottom: 4 }}
          />
          <Text style={styles.driverName}>{user?.name}</Text>
        </View>

        {/* Toggle ONLINE — grande, Módulo 1 */}
        <TouchableOpacity
          onPress={() => {
            toggleScale.value = withSequence(withTiming(0.92, { duration: 80 }), withSpring(1, { damping: 14 }));
            toggleOnline();
          }}
          activeOpacity={1}
        >
          <Animated.View style={[styles.onlineToggle, toggleBgStyle, toggleBorderStyle]}>
            <View style={{ width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: isOnline ? theme.colors.surface : theme.colors.surfaceHigh }}>
              <View style={[{ width: 8, height: 8, borderRadius: 4 }, { backgroundColor: isOnline ? theme.colors.primaryText : theme.colors.textMuted }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.onlineToggleText, { color: isOnline ? theme.colors.primaryText : theme.colors.textSecondary, fontWeight: 'bold' }]}>
                {isOnline ? 'EN LÍNEA' : 'CONECTAR'}
              </Text>
              <Text style={[styles.onlineToggleText, { color: isOnline ? `${theme.colors.primaryText}99` : theme.colors.textMuted }]}>
                {isOnline ? 'Recibiendo viajes' : 'Toca para activar'}
              </Text>
            </View>
            {/* Indicador LED */}
            <View style={[{ width: 8, height: 8, borderRadius: 4, marginLeft: 4 }, { backgroundColor: isOnline ? theme.colors.primaryText : theme.colors.border }]} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* ── STRIPE BANNER ── */}
      {!onboardingComplete && (
        <TouchableOpacity
          style={styles.stripeBanner}
          onPress={async () => {
            try {
              const res = await stripeFrontendService.getOnboardingLink();
              if (res.url) Linking.openURL(res.url);
            } catch { Alert.alert(t('driver.networkError'), t('driver.bankLinkError')); }
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.stripeBannerText}>⚡ {t('driver.financialRequiredMsg')} →</Text>
        </TouchableOpacity>
      )}

      {/* ── BOTTOM SHEET CONTEXTUAL ── */}
      {hasActiveSheet && (
        <BottomSheet
          ref={sheetRef}
          index={1}
          snapPoints={snapPoints}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.sheetHandle}
          style={theme.shadows.lg}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >

            {/* ═══ IDLE ONLINE — esperando viajes ══════════════════════════════ */}
            {phase === 'IDLE' && isOnline && (
              <View style={styles.idleOnlineContainer}>
                {/* Stats rápidos del día */}
                <View style={styles.idleStatsRow}>
                  <View style={styles.idleStatCard}>
                    <Text style={styles.idleStatValue}>{todayTrips ?? 0}</Text>
                    <Text style={styles.idleStatLabel}>Viajes hoy</Text>
                  </View>
                  <View style={[styles.idleStatCard, styles.idleStatCardCenter]}>
                    <Text style={[styles.idleStatValue, { color: theme.colors.primary }]}>
                      MX${todayEarnings?.toFixed(0) ?? '0'}
                    </Text>
                    <Text style={styles.idleStatLabel}>Ganado hoy</Text>
                  </View>
                  <View style={styles.idleStatCard}>
                    <Text style={styles.idleStatValue}>{user?.avgRating?.toFixed(1) ?? '—'}</Text>
                    <Text style={styles.idleStatLabel}>⭐ Rating</Text>
                  </View>
                </View>
                <Text style={styles.idleWaitText}>Esperando solicitudes de viaje...</Text>
                <View style={styles.idleDotsRow}>
                  {[0, 1, 2].map(i => <PulsingDot key={i} delay={i * 300} color={theme.colors.primary} />)}
                </View>
              </View>
            )}

            {/* ═══ INCOMING RIDE ═══════════════════════════════════════ */}
            {(phase === 'INCOMING' || phase === 'BID_SENT') && incomingRide && (
              <Animated.View style={incomingAnimStyle}>

                {phase === 'BID_SENT' ? (
                  /* ── Oferta enviada: esperar ── */
                  <View style={styles.bidWaiting}>
                    <Loader label={t('driver.waitingResponse')} />
                    <Button
                      label={t('driver.cancelOffer')}
                      variant="ghost"
                      size="sm"
                      onPress={handleIgnore}
                      style={{ marginTop: 24 }}
                    />
                  </View>
                ) : (
                  /* ── Nueva solicitud ── */
                  <>
                    {/* Cabecera del viaje */}
                    <View style={styles.rideHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View>
                          {/* Avatar del pasajero — con fallback a iniciales */}
                          {incomingRide?.passenger?.avatarUrl || incomingRide?.passenger?.profilePhoto ? (
                            <Image
                              source={{ uri: incomingRide.passenger.avatarUrl || incomingRide.passenger.profilePhoto }}
                              style={styles.passengerAvatar}
                            />
                          ) : (
                            <View style={styles.passengerAvatarFallback}>
                              <Text style={styles.passengerAvatarInitial}>
                                {(incomingRide?.passenger?.name || 'P').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <View style={styles.passengerVerifiedBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                          </View>
                        </View>
                        <View>
                          <Text style={styles.rideSectionLabel}>{t('driver.newRide')}</Text>
                          <Text style={styles.passengerName}>{incomingRide.passenger?.name ?? t('driver.passenger')}</Text>
                        </View>
                      </View>
                      <View style={styles.priceTag}>
                        <Text style={styles.priceAmount}>{formatPrice(incomingRide.proposedPrice)}</Text>
                      </View>
                    </View>

                    {/* Origen → Destino */}
                    <View style={styles.routeCard}>
                      <View style={styles.routeRow}>
                        <View style={styles.dotPickup} />
                        <View style={styles.routeTextWrap}>
                          <Text style={styles.routeLabel}>{t('driver.pickup')}</Text>
                          <Text style={styles.routeAddress} numberOfLines={1}>
                            {incomingRide.pickupLocation?.address}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.routeDivider} />
                      <View style={styles.routeRow}>
                        <View style={styles.dotDropoff} />
                        <View style={styles.routeTextWrap}>
                          <Text style={styles.routeLabel}>{t('driver.destination')}</Text>
                          <Text style={styles.routeAddress} numberOfLines={1}>
                            {incomingRide.dropoffLocation?.address}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Trip metrics — distance, time, earnings */}
                    <View style={styles.tripMetrics}>
                      {incomingMetrics.distToPassenger != null && (
                        <View style={styles.metricItem}>
                          <Text style={styles.metricValue}>{incomingMetrics.distToPassenger.toFixed(1)} km</Text>
                          <Text style={styles.metricLabel}>{t('driver.toPassenger')}</Text>
                        </View>
                      )}
                      {incomingMetrics.tripDist != null && (
                        <View style={styles.metricItem}>
                          <Text style={styles.metricValue}>{incomingMetrics.tripDist.toFixed(1)} km</Text>
                          <Text style={styles.metricLabel}>{t('driver.totalTrip')}</Text>
                        </View>
                      )}
                      {incomingMetrics.estTime != null && (
                        <View style={styles.metricItem}>
                          <Text style={styles.metricValue}>{incomingMetrics.estTime} min</Text>
                          <Text style={styles.metricLabel}>{t('driver.estTime')}</Text>
                        </View>
                      )}
                      {incomingMetrics.estEarnings != null && (
                        <View style={[styles.metricItem, styles.metricItemHighlight]}>
                          <Ionicons name="card" size={24} color={theme.colors.success} />
                          <Text style={styles.metricValueEarnings}>{formatPrice(incomingMetrics.estEarnings)}</Text>
                          <Text style={styles.metricLabel}>{t('driver.earnings')}</Text>
                        </View>
                      )}
                    </View>
                    {/* Acción principal — 2 botones grandes */}
                    <View style={styles.mainActions}>
                      <Button
                        label={t('driver.ignore')}
                        variant="secondary"
                        size="lg"
                        onPress={handleIgnore}
                        style={{ flex: 1, marginRight: 8 }}
                      />
                      <Button
                        label={`${t('driver.accept')} ${formatPrice(incomingRide.proposedPrice)}`}
                        variant="success"
                        size="lg"
                        onPress={() => handleBid(0)}
                        style={{ flex: 2 }}
                      />
                    </View>

                    {/* Contra-oferta — secundaria */}
                    <Text style={styles.counterLabel}>{t('driver.counterOffer')}</Text>
                    <View style={styles.counterRow}>
                      {[5, 10, 15].map(add => (
                        <Button
                          key={add}
                          label={`+${formatPrice(convertToUsd(add))}`}
                          variant="ghost"
                          size="sm"
                          onPress={() => handleBid(add)}
                          style={styles.counterBtn}
                        />
                      ))}
                    </View>
                  </>
                )}
              </Animated.View>
            )}

            {/* ═══ ACTIVE RIDE ══════════════════════════════════════════ */}
            {activeRide && (phase === 'ACCEPTED' || phase === 'ARRIVED' || phase === 'IN_PROGRESS') && (
              <View style={styles.activeRideCard}>

                {/* Barra de progreso del viaje — 3 pasos */}
                <View style={styles.tripProgressBar}>
                  {(['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] as const).map((p, i) => {
                    const phases = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];
                    const currentIdx = phases.indexOf(phase);
                    const isDone = i < currentIdx;
                    const isActive = i === currentIdx;
                    return (
                      <React.Fragment key={p}>
                        <View style={[
                          styles.tripStep,
                          isDone && styles.tripStepDone,
                          isActive && styles.tripStepActive,
                        ]}>
                          <Text style={[styles.tripStepNum, (isDone || isActive) && styles.tripStepNumActive]}>
                            {isDone ? '✓' : String(i + 1)}
                          </Text>
                        </View>
                        {i < 2 && (
                          <View style={[styles.tripStepLine, isDone && styles.tripStepLineDone]} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>

                {/* Destino actual */}
                <Text style={styles.activePhaseLabelNew}>
                  {phase === 'ACCEPTED' ? '📍 Recogiendo pasajero' :
                   phase === 'ARRIVED'  ? '🧍 Pasajero esperando' :
                                          '🏁 En camino al destino'}
                </Text>
                <Text style={styles.activeAddressNew} numberOfLines={2}>
                  {phase === 'IN_PROGRESS'
                    ? activeRide.dropoffLocation?.address
                    : activeRide.pickupLocation?.address}
                </Text>

                {/* Métricas live */}
                {activeMetrics.dist != null && (
                  <View style={styles.activeMetricsRow}>
                    <View style={styles.activeMetric}>
                      <Text style={styles.activeMetricVal}>{activeMetrics.dist.toFixed(1)}</Text>
                      <Text style={styles.activeMetricUnit}>km</Text>
                    </View>
                    <View style={styles.activeMetricDivider} />
                    <View style={styles.activeMetric}>
                      <Text style={styles.activeMetricVal}>{activeMetrics.eta}</Text>
                      <Text style={styles.activeMetricUnit}>min</Text>
                    </View>
                    <View style={styles.activeMetricDivider} />
                    <View style={styles.activeMetric}>
                      <Text style={[styles.activeMetricVal, { color: theme.colors.primary }]}>
                        MX${(activeRide.proposedPrice * 0.80).toFixed(0)}
                      </Text>
                      <Text style={styles.activeMetricUnit}>ganancia</Text>
                    </View>
                  </View>
                )}

                {/* Botones navegar */}
                <TouchableOpacity
                  style={styles.navigateBtnNew}
                  onPress={() => {
                    const target = phase === 'IN_PROGRESS' ? activeRide.dropoffLocation : activeRide.pickupLocation;
                    const lat = target?.latitude ?? target?.coordinates?.[1];
                    const lng = target?.longitude ?? target?.coordinates?.[0];
                    if (!lat || !lng) return;
                    const dest = `${lat},${lng}`;
                    Alert.alert('Navegar con', '', [
                      { text: 'Google Maps', onPress: () => Linking.openURL(Platform.OS === 'ios' ? `comgooglemaps://?daddr=${dest}&directionsmode=driving` : `google.navigation:q=${dest}&mode=d`).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest}`)) },
                      Platform.OS === 'ios' && { text: 'Apple Maps', onPress: () => Linking.openURL(`maps://maps.apple.com/?daddr=${dest}`) } as any,
                      { text: 'Waze', onPress: () => Linking.openURL(`waze://?ll=${dest}&navigate=yes`).catch(() => {}) },
                      { text: 'Cancelar', style: 'cancel' },
                    ].filter(Boolean) as any);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="navigate" size={18} color={theme.colors.primaryText} />
                  <Text style={styles.navigateBtnText}>
                    {phase === 'IN_PROGRESS' ? 'Navegar al destino' : 'Navegar al pasajero'}
                  </Text>
                </TouchableOpacity>

                {/* Acción principal */}
                <View style={styles.activeActionsRow}>
                  <TouchableOpacity style={styles.chatBtnSmall} onPress={() => setChatVisible(true)}>
                    <Ionicons name="chatbubble-outline" size={18} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <Button
                    label={phase === 'ACCEPTED' ? 'Llegué al punto de recogida' : phase === 'ARRIVED' ? 'Iniciar viaje' : 'Finalizar viaje'}
                    variant={phase === 'IN_PROGRESS' ? 'success' : 'primary'}
                    size="lg"
                    style={{ flex: 1 }}
                    onPress={() => handleAdvance(phase === 'ACCEPTED' ? 'ARRIVED' : phase === 'ARRIVED' ? 'IN_PROGRESS' : 'COMPLETED')}
                  />
                </View>
              </View>
            )}

          </BottomSheetScrollView>
        </BottomSheet>
      )}

      {/* ── CHAT SHEET ── */}
      <ChatSheet
        rideId={activeRide?._id ?? null}
        myUserId={user?._id}
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
      />

    </View>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const getStyles = (theme: Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  loaderScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    position:       'absolute',
    top:            Platform.OS === 'ios' ? 56 : 36,
    left:           16,
    right:          16,
    zIndex:         20,
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    backgroundColor: theme.colors.surface,
    borderRadius:   theme.borderRadius.l,
    paddingVertical:  12,
    paddingHorizontal: theme.spacing.l,
    borderWidth:    1,
    borderColor:    theme.colors.border,
    ...theme.shadows.md,
  },
  driverName: {
    ...theme.typography.body,
    fontWeight: '600',
    fontSize:   15,
    color:      theme.colors.text,
  },
  onlineToggle: {
    flexDirection: 'row',
    alignItems:    'center',
    borderRadius:  theme.borderRadius.pill,
    paddingVertical:  8,
    paddingHorizontal: 16,
    gap: 6,
  },
  onlineToggleActive:   { backgroundColor: theme.colors.success },
  onlineToggleInactive: { backgroundColor: theme.colors.surfaceHigh, borderWidth: 1, borderColor: theme.colors.border },
  onlineToggleText:     { ...theme.typography.label, fontSize: 12, color: theme.colors.textSecondary },
  onlineToggleTextActive: { color: theme.colors.primaryText },

  // ── Stripe Banner ─────────────────────────────────────────────────────────
  stripeBanner: {
    position:   'absolute',
    top:        Platform.OS === 'ios' ? 140 : 110,
    left: 16, right: 16,
    zIndex: 19,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.m,
    padding: 14,
    ...theme.shadows.md,
  },
  stripeBannerText: { color: theme.colors.primaryText, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // ── Bottom Sheet ──────────────────────────────────────────────────────────
  sheetBg:     { backgroundColor: theme.colors.surface, borderRadius: 32 },
  sheetHandle: { backgroundColor: theme.colors.border, width: 40, height: 4 },
  sheetContent: { paddingHorizontal: theme.spacing.xl, paddingBottom: 48 },

  // ── Incoming Ride ─────────────────────────────────────────────────────────
  rideHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   theme.spacing.l,
    paddingTop:     theme.spacing.m,
  },
  rideSectionLabel: {
    ...theme.typography.label,
    color: theme.colors.primary,
    marginBottom: 4,
  },
  passengerName: {
    ...theme.typography.title,
    fontSize: 22,
  },
  priceTag: {
    flexDirection:   'row',
    alignItems:      'flex-end',
    backgroundColor: theme.colors.successLight,
    borderRadius:    theme.borderRadius.m,
    paddingVertical:  8,
    paddingHorizontal: 14,
  },
  priceCurrency: { color: theme.colors.success, fontSize: 20, fontWeight: '700', lineHeight: 38 },
  priceAmount:   { color: theme.colors.success, fontSize: 38, fontWeight: '800', lineHeight: 44 },

  // ── Route Card ────────────────────────────────────────────────────────────
  routeCard: {
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius:    theme.borderRadius.l,
    padding:         theme.spacing.l,
    marginBottom:    theme.spacing.l,
    borderWidth:     1,
    borderColor:     theme.colors.border,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  routeDivider: {
    width:        2,
    height:       20,
    backgroundColor: theme.colors.border,
    marginLeft:   7,
    marginVertical: 4,
  },
  dotPickup: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: theme.colors.primary,
    flexShrink: 0,
  },
  dotDropoff: {
    width: 14, height: 14, borderRadius: 2,
    backgroundColor: theme.colors.text,
    flexShrink: 0,
  },
  routeTextWrap: { flex: 1 },
  routeLabel: { ...theme.typography.label, marginBottom: 2 },
  routeAddress: { ...theme.typography.body, fontWeight: '600', fontSize: 15 },

  // ── Trip metrics ──────────────────────────────────────────────────────────
  tripMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricItemHighlight: {
    backgroundColor: theme.colors.primaryLight2,
    borderRadius: theme.borderRadius.s,
    paddingVertical: 4,
  },
  metricValue: {
    ...theme.typography.title,
    fontSize: 16,
    marginBottom: 2,
  },
  metricValueEarnings: {
    ...theme.typography.title,
    fontSize: 18,
    color: theme.colors.primary,
    marginBottom: 2,
  },
  metricLabel: {
    ...theme.typography.label,
    fontSize: 10,
  },

  // ── Main action buttons ───────────────────────────────────────────────────
  mainActions: {
    flexDirection: 'row',
    marginBottom: theme.spacing.m,
    gap: 0,
  },
  counterLabel: {
    ...theme.typography.label,
    textAlign:    'center',
    marginBottom: theme.spacing.s,
    marginTop:    theme.spacing.xs,
  },
  counterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  counterBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceHigh,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.pill,
  },

  // ── Bid waiting ───────────────────────────────────────────────────────────
  bidWaiting: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
  },

  // ── Active Ride (Rediseño) ────────────────────────────────────────────────
  activeRideCard: {
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
  },
  tripProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  tripStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceHigh,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  tripStepActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  tripStepDone: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  tripStepNum: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  tripStepNumActive: {
    color: theme.colors.text,
  },
  tripStepLine: {
    flex: 1,
    height: 3,
    backgroundColor: theme.colors.border,
    marginHorizontal: -2,
    zIndex: 1,
  },
  tripStepLineDone: {
    backgroundColor: theme.colors.success,
  },
  activePhaseLabelNew: {
    ...theme.typography.label,
    textAlign: 'center',
    marginBottom: 6,
  },
  idleOnlineContainer: {
    padding: theme.spacing.xl,
  },
  idleStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.l,
    padding: theme.spacing.m,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  idleStatCard: {
    flex: 1,
    alignItems: 'center',
  },
  idleStatCardCenter: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  idleStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 2,
  },
  idleStatLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    fontSize: 11,
  },
  idleWaitText: {
    ...theme.typography.body,
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.m,
  },
  idleDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  activeAddressNew: {
    ...theme.typography.title,
    fontSize: 22,
    textAlign: 'center',
    marginBottom: theme.spacing.l,
    paddingHorizontal: theme.spacing.m,
  },
  activeMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.l,
    paddingVertical: 14,
    marginBottom: theme.spacing.l,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeMetric: {
    alignItems: 'center',
    flex: 1,
  },
  activeMetricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  activeMetricUnit: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  activeMetricDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.borderLight,
  },
  navigateBtnNew: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.text,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.m,
    gap: 8,
  },
  navigateBtnText: {
    color: theme.colors.primaryText,
    fontWeight: '700',
    fontSize: 15,
  },
  activeActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  chatBtnSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  advanceBtn: {
    marginBottom: theme.spacing.l,
    minHeight: 64,  // más grande — uso con una mano en movimiento
  },
  chatQuickBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceHigh,
  },
  chatQuickText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  passengerAvatar: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2.5, borderColor: theme.colors.primary,
  },
  passengerAvatarFallback: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 2.5, borderColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  passengerAvatarInitial: {
    fontSize: 26, fontWeight: '700', color: theme.colors.primary,
  },
  passengerVerifiedBadge: {
    position: 'absolute', bottom: -2, right: -2,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
  },
  navButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14, paddingHorizontal: 20,
    borderRadius: theme.borderRadius.pill,
    marginVertical: theme.spacing.s, gap: 8,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  navButtonText: {
    fontSize: 16, fontWeight: '700', color: theme.colors.primaryText,
  },
});
