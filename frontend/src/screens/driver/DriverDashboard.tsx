import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming,
} from 'react-native-reanimated';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';

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

  // ── Socket + GPS Setup (solo mount) ──────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let locationSubscription: Location.LocationSubscription | null = null;
    socketService.connect();

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
      } catch (err) {
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
      socketService.getSocket()?.emit('setDriverStatus', { userId: user?._id, status: 'OFFLINE' });
      socketService.disconnect();
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
  useRideSocketEvent('ride:incoming', useCallback((ride, ack) => {
    if (__DEV__) console.log(`[FRONTEND] Recibido evento 'ride:incoming' para ride: ${ride?._id}`);
    
    // Responder el ACK al backend
    if (typeof ack === 'function') {
        ack("RECIBIDO_POR_FRONTEND");
    }

    if (isOnlineRef.current && !activeRideRef.current) {
      setIncomingRide(ride);
      setPhase('INCOMING');
      // Animar entrada — después de state flush
      setTimeout(animateIncomingIn, 30);
    }
  }, [animateIncomingIn]));

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
    } catch (e: any) {
      Alert.alert(t('driver.networkError'), e.message);
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
    } catch (e: any) {
      Alert.alert(t('driver.auctionFailed'), e.message);
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
    } catch (e: any) {
      Alert.alert(t('driver.networkError'), e.message);
    }
  }, [activeRide, user]);

  const handleRatePassenger = useCallback(async (score: number) => {
    if (completedRide) {
       try {
           Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
           await socketService.emitWithAck('rate_passenger', {
             rideId: completedRide._id,
             passengerId: completedRide.passenger?._id ?? completedRide.passenger,
             fromUserId: user?._id,
             score,
           });
       } catch (error: any) {
           Alert.alert(t('driver.ratingError'), error.message);
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

  const hasActiveSheet = phase !== 'IDLE';

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

        {/* Toggle ONLINE — grande, claro */}
        {/* BUG 3 FIX: Solo el Switch dispara toggleOnline, TouchableOpacity es solo contenedor visual */}
        <TouchableOpacity
          style={[styles.onlineToggle, isOnline ? styles.onlineToggleActive : styles.onlineToggleInactive]}
          activeOpacity={1}
        >
          <Text style={[styles.onlineToggleText, isOnline && styles.onlineToggleTextActive]}>
            {isOnline ? 'EN LÍNEA' : 'CONECTAR'}
          </Text>
          <Switch
            trackColor={{ false: 'transparent', true: 'rgba(255,255,255,0.35)' }}
            thumbColor={isOnline ? theme.colors.text : theme.colors.border}
            onValueChange={toggleOnline}
            value={isOnline}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
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
                      <View>
                        <Text style={styles.rideSectionLabel}>{t('driver.newRide')}</Text>
                        <Text style={styles.passengerName}>{incomingRide.passenger?.name ?? t('driver.passenger')}</Text>
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
              <View style={styles.activeRideContainer}>

                {/* Fase actual */}
                <StatusBadge
                  variant={phase === 'IN_PROGRESS' ? 'active' : 'searching'}
                  label={
                    phase === 'ACCEPTED'    ? t('driver.goingToPassenger')  :
                    phase === 'ARRIVED'     ? t('driver.passengerWaiting') :
                    t('driver.enRouteDestination')
                  }
                  style={styles.activeBadge}
                />

                {/* Dirección objetivo */}
                <Text style={styles.activeDestLabel}>
                  {phase === 'IN_PROGRESS' ? t('driver.destinationLabel') : t('driver.pickupAt')}
                </Text>
                <Text style={styles.activeDestAddress} numberOfLines={2}>
                  {phase === 'IN_PROGRESS'
                    ? activeRide.dropoffLocation?.address
                    : activeRide.pickupLocation?.address}
                </Text>

                {/* Live distance + ETA */}
                {activeMetrics.dist != null && activeMetrics.eta != null && (
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12, marginBottom: 4 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.primary }}>{activeMetrics.dist.toFixed(1)} km</Text>
                      <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>{t('driver.distance')}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 20, fontWeight: '800', color: theme.colors.text }}>{activeMetrics.eta} min</Text>
                      <Text style={{ ...theme.typography.caption, color: theme.colors.textSecondary }}>{t('driver.estTime')}</Text>
                    </View>
                  </View>
                )}

                {/* Navigate button — opens native maps */}
                {(phase === 'ACCEPTED' || phase === 'ARRIVED') && (
                  <TouchableOpacity
                    style={[styles.chatQuickBtn, { backgroundColor: theme.colors.primaryLight, marginBottom: 8 }]}
                    onPress={() => {
                      const pickup = activeRide?.pickupLocation;
                      const lat = pickup?.latitude ?? pickup?.lat;
                      const lng = pickup?.longitude ?? pickup?.lng;
                      if (!lat || !lng) return;
                      const url = Platform.OS === 'ios'
                        ? `http://maps.apple.com/?daddr=${lat},${lng}`
                        : `google.navigation:q=${lat},${lng}`;
                      Linking.openURL(url);
                    }}
                  >
                    <Text style={[styles.chatQuickText, { color: theme.colors.primary }]}>📍 {t('ride.navigate')} → {t('driver.passenger')}</Text>
                  </TouchableOpacity>
                )}
                {phase === 'IN_PROGRESS' && (
                  <TouchableOpacity
                    style={[styles.chatQuickBtn, { backgroundColor: theme.colors.primaryLight, marginBottom: 8 }]}
                    onPress={() => {
                      const dropoff = activeRide?.dropoffLocation;
                      const lat = dropoff?.latitude ?? dropoff?.lat;
                      const lng = dropoff?.longitude ?? dropoff?.lng;
                      if (!lat || !lng) return;
                      const url = Platform.OS === 'ios'
                        ? `http://maps.apple.com/?daddr=${lat},${lng}`
                        : `google.navigation:q=${lat},${lng}`;
                      Linking.openURL(url);
                    }}
                  >
                    <Text style={[styles.chatQuickText, { color: theme.colors.primary }]}>📍 {t('ride.navigate')} → {t('driver.destinationLabel')}</Text>
                  </TouchableOpacity>
                )}

                {/* Botón de acción grande — UNA sola acción a la vez */}
                {phase === 'ACCEPTED' && (
                  <Button
                    label={t('driver.arrivedAtPoint')}
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={() => handleAdvance('ARRIVED')}
                    style={styles.advanceBtn}
                  />
                )}
                {phase === 'ARRIVED' && (
                  <Button
                    label={t('driver.startRide')}
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={() => handleAdvance('IN_PROGRESS')}
                    style={styles.advanceBtn}
                  />
                )}
                {phase === 'IN_PROGRESS' && (
                  <Button
                    label={t('driver.finishRide')}
                    variant="success"
                    size="lg"
                    fullWidth
                    onPress={() => handleAdvance('COMPLETED')}
                    style={styles.advanceBtn}
                  />
                )}

                {/* Chat — acceso rápido, no prominente */}
                <TouchableOpacity
                  style={styles.chatQuickBtn}
                  onPress={() => setChatVisible(true)}
                >
                  <Text style={styles.chatQuickText}>{t('driver.messagePassenger')}</Text>
                </TouchableOpacity>
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

  // ── Active Ride ───────────────────────────────────────────────────────────
  activeRideContainer: {
    paddingTop: theme.spacing.m,
    alignItems: 'center',
  },
  activeBadge: {
    alignSelf: 'center',
    marginBottom: theme.spacing.l,
  },
  activeDestLabel: {
    ...theme.typography.label,
    marginBottom: 6,
  },
  activeDestAddress: {
    ...theme.typography.title,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.m,
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
});
