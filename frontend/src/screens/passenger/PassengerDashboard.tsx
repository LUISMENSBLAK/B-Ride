import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useStripe } from '@stripe/stripe-react-native';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Alert, Modal, AppState,
  ActivityIndicator, Image, Keyboard, FlatList, BackHandler
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, interpolate, Extrapolation, withSequence, runOnJS } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../../store/authStore';
import { useRideFlowStore } from '../../store/useRideFlowStore';
import { useSocketStore } from '../../store/useSocketStore';
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
import ActiveRidePanel from '../../components/ActiveRidePanel';
import FareOfferSheet from './FareOfferSheet';
import AddFavoriteSheet, {
  loadFavorites, saveFavorite, deleteFavorite,
  type Favorite,
} from './AddFavoriteSheet';
import { haversineKm } from '../../utils/geo';
import { useCurrency } from '../../hooks/useCurrency';
import MapPinOverlay from '../../components/MapPinOverlay';

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
const DriverPill = memo(({ count, animatedIndex }: { count: number, animatedIndex: any }) => {
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

  const stylez = useAnimatedStyle(() => {
    let baseOpacity = count === 0 ? 0 : 1;
    let indexOpacity = 1;
    let indexScale = 1;
    if (animatedIndex && animatedIndex.value !== undefined) {
       indexOpacity = interpolate(animatedIndex.value, [1, 1.5, 2], [1, 0.5, 0], Extrapolation.CLAMP);
       indexScale = interpolate(animatedIndex.value, [1, 2], [1, 0.9], Extrapolation.CLAMP);
    }
    return {
      opacity: baseOpacity * indexOpacity,
      transform: [{ scale: indexScale }]
    };
  });

  const iconStylez = useAnimatedStyle(() => ({ opacity: pulseAnim.value }));

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

// ── FavoritesList — dynamic from AsyncStorage ─────────────────────────────
const FavoritesList = memo(({ favorites, onSelect, onAdd, onDelete }: {
  favorites: Favorite[];
  onSelect: (fav: Favorite) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) => {
  const data: (Favorite | { id: '__add__'; isAdd: true })[] = [
    ...favorites,
    { id: '__add__', isAdd: true },
  ];

  return (
    <View style={{ marginTop: 16, position: 'relative' }}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 10, paddingRight: 32 }}
        renderItem={({ item }) => {
          if ('isAdd' in item) {
            return (
              <TouchableOpacity onPress={onAdd} activeOpacity={0.8}>
                <View style={favStyles.chipDashed}>
                  <Ionicons name="add" size={14} color="#F5C518" />
                  <Text style={favStyles.addText}>Agregar</Text>
                </View>
              </TouchableOpacity>
            );
          }
          const fav = item as Favorite;
          return (
            <TouchableOpacity
              onPress={() => onSelect(fav)}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                Alert.alert(
                  fav.emoji + ' ' + fav.name,
                  'Eliminar este favorito?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(fav.id) },
                  ],
                );
              }}
              delayLongPress={500}
              activeOpacity={0.8}
            >
              <View style={favStyles.chip}>
                <Text style={favStyles.emoji}>{fav.emoji}</Text>
                <Text style={favStyles.name}>{fav.name}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <LinearGradient
        colors={['rgba(13,5,32,0)', 'rgba(13,5,32,0.92)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', right: -16, top: 0, bottom: 0, width: 32 }}
        pointerEvents="none"
      />
    </View>
  );
});

const favStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    gap: 6,
  },
  chipDashed: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    gap: 6,
  },
  emoji: { fontSize: 16 },
  name: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  addText: { color: 'rgba(255,255,255,0.60)', fontSize: 13, fontWeight: '500' },
  dist: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
});



// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function PassengerDashboard() {
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const socketStatus = useSocketStore(s => s.status);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const fareOfferSheetRef = useRef<any>(null); // Ref for FareOfferSheet
  const [currentSnapIndex, setCurrentSnapIndex] = useState(0);
  const animatedIndex = useSharedValue(0);
  const [showLocating, setShowLocating] = useState(true);

  // --- UBER STYLE DUAL MAP SELECTOR ---
  const [activeMapField, setActiveMapField] = useState<'destination' | 'pickup' | null>(null);
  const [pickupLocation, setPickupLocation] = useState<PlaceResult>({
    displayName: 'Mi Ubicación Actual',
    placeId: 'default_pickup'
  });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const mapCenterReverseGeocodeTimer = useRef<NodeJS.Timeout | null>(null);

  // ─── MAP SELECTION MODE ("Fijar en mapa") ──────────────────────────────────
  type MapSelectionMode = 'none' | 'pickup' | 'destination';
  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionMode>('none');
  const [pendingCoordinate, setPendingCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  // Initialize pickupLocation when GPS is found
  useEffect(() => {
    if (location && pickupLocation.placeId === 'default_pickup') {
      setPickupLocation(prev => ({
        ...prev,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }));
    }
  }, [location]);

  const handleRegionChange = useCallback(() => {
    setIsMapDragging(true);
    if (mapCenterReverseGeocodeTimer.current) {
      clearTimeout(mapCenterReverseGeocodeTimer.current);
    }
    if (mapSelectionMode !== 'none') setIsDragging(true);
  }, [mapSelectionMode]);

  const handleRegionChangeComplete = useCallback(async (region: any) => {
    setIsMapDragging(false);
    setIsDragging(false);

    // ── Map-selection mode: capture pending coord + reverse geocode ──
    if (mapSelectionMode !== 'none') {
      setPendingCoordinate({ latitude: region.latitude, longitude: region.longitude });
      setPendingAddress('');
      try {
        const res = await Location.reverseGeocodeAsync({ latitude: region.latitude, longitude: region.longitude });
        if (res && res.length > 0) {
          const r = res[0];
          const addr = r.street
            ? `${r.street}${r.streetNumber ? ' ' + r.streetNumber : ''}, ${r.city || ''}`.trim()
            : (r.name || 'Ubicación seleccionada');
          setPendingAddress(addr);
        }
      } catch { setPendingAddress('Ubicación en el mapa'); }
      return;
    }

    if (!activeMapField) return;
    mapCenterReverseGeocodeTimer.current = setTimeout(async () => {
      try {
        const res = await Location.reverseGeocodeAsync({ latitude: region.latitude, longitude: region.longitude });
        if (res && res.length > 0) {
          const address = res[0].street ? `${res[0].street} ${res[0].streetNumber || ''}, ${res[0].city || ''}`.trim() : (res[0].name || 'Ubicación seleccionada');
          const newPlace: PlaceResult = {
             displayName: address,
             placeId: `map_${Date.now()}`,
             latitude: region.latitude,
             longitude: region.longitude
          };
          if (activeMapField === 'destination') {
             setSelectedPlace(newPlace);
          } else {
             setPickupLocation(newPlace);
          }
        }
      } catch (err) {
        console.log('Reverse geocode error', err);
      }
    }, 400);
  }, [activeMapField, mapSelectionMode]);

  useEffect(() => {
    const timer = setTimeout(() => setShowLocating(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // ─── BackHandler: cancel map-selection on hardware back ────────────────────
  useEffect(() => {
    if (mapSelectionMode === 'none') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setMapSelectionMode('none');
      setPendingCoordinate(null);
      return true;
    });
    return () => sub.remove();
  }, [mapSelectionMode]);

  // ─── Confirm map-selected point ────────────────────────────────────────────
  const handleConfirmMapPoint = useCallback(() => {
    if (!pendingCoordinate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const place: PlaceResult = {
      displayName: pendingAddress || 'Ubicación en el mapa',
      placeId: `mappin_${Date.now()}`,
      latitude: pendingCoordinate.latitude,
      longitude: pendingCoordinate.longitude,
    };
    if (mapSelectionMode === 'pickup') {
      setPickupLocation(place);
      setPendingCoordinate(null);
      setPendingAddress('');
      setMapSelectionMode('destination');
    } else {
      setSelectedPlace(place);
      saveToHistory(place);
      setMapSelectionMode('none');
      setPendingCoordinate(null);
      setPendingAddress('');
      bottomSheetRef.current?.snapToIndex(0);
      setTimeout(() => fareOfferSheetRef.current?.expand(), 300);
    }
  }, [pendingCoordinate, pendingAddress, mapSelectionMode, saveToHistory]);

  const searchGlowAnim = useSharedValue(0);
  useEffect(() => {
    searchGlowAnim.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 1250 }),
        withTiming(0, { duration: 1250 })
      ),
      -1,
      true
    );
  }, []);
  const searchGlowStyle = useAnimatedStyle(() => ({
    shadowOpacity: currentSnapIndex === 0 ? searchGlowAnim.value : 0
  }));

  const theme = useAppTheme();
  const { t } = useTranslation();
  const { currency, formatPrice, convertToUsd } = useCurrency();
  const styles = React.useMemo(() => getStyles(theme), [theme]);


  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);

  // ── Ride history (AsyncStorage 'ride_history') ──
  const [rideHistory, setRideHistory] = useState<PlaceResult[]>([]);
  useEffect(() => {
    AsyncStorage.getItem('ride_history').then(raw => {
      if (raw) {
        try { setRideHistory(JSON.parse(raw).slice(0, 3)); } catch {}
      }
    });
  }, []);

  const saveToHistory = useCallback(async (place: PlaceResult) => {
    try {
      const raw = await AsyncStorage.getItem('ride_history');
      const prev: PlaceResult[] = raw ? JSON.parse(raw) : [];
      const filtered = prev.filter(p => p.placeId !== place.placeId);
      const updated = [place, ...filtered].slice(0, 3);
      await AsyncStorage.setItem('ride_history', JSON.stringify(updated));
      setRideHistory(updated);
    } catch {}
  }, []);

  // ── User favorites (AsyncStorage 'user_favorites') ──
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [addFavVisible, setAddFavVisible] = useState(false);
  useEffect(() => {
    loadFavorites().then(setFavorites);
  }, []);

  const handleDeleteFav = useCallback(async (id: string) => {
    const updated = await deleteFavorite(id);
    setFavorites(updated);
  }, []);

  // Trip state centralizado
  const { status: rideStatus, setStatus: setRideStatus, rideId: currentRideId, setRideContext, bids, receiveBid, resetFlow, setActiveRide, paymentMethod } = useRideFlowStore();
  // FIX-7A: suscripción reactiva a activeRidePayload (getState() no re-renderiza)
  const activeRidePayload = useRideFlowStore(s => s.activeRidePayload);
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
  const [paymentSelectorVisible, setPaymentSelectorVisible] = useState(false);

  // ── Banner de conexión — NUNCA aparece en primer render ──
  const hasEverConnected = useRef(false);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerState, setBannerState] = useState<'hidden' | 'amber' | 'red'>('hidden');
  const initialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (socketStatus === 'connected') {
      hasEverConnected.current = true;
      // Socket conectó — cancelar todos los timers y ocultar banner
      if (initialTimerRef.current) { clearTimeout(initialTimerRef.current); initialTimerRef.current = null; }
      if (redTimerRef.current) { clearTimeout(redTimerRef.current); redTimerRef.current = null; }
      setShowBanner(false);
      setBannerState('hidden');
      return;
    }

    if (!hasEverConnected.current) {
      // Primer intento de conexión — esperar 8s completos antes de mostrar NADA
      if (!initialTimerRef.current) {
        initialTimerRef.current = setTimeout(() => {
          // Solo mostrar si el socket SIGUE sin conectar
          if (!hasEverConnected.current) {
            setShowBanner(true);
            setBannerState('red');
          }
          initialTimerRef.current = null;
        }, 8000);
      }
    } else {
      // Perdió conexión DESPUÉS de haber conectado exitosamente
      setShowBanner(true);
      setBannerState('amber');
      redTimerRef.current = setTimeout(() => {
        setBannerState('red');
        redTimerRef.current = null;
      }, 15000);
    }

    return () => {
      if (initialTimerRef.current) { clearTimeout(initialTimerRef.current); initialTimerRef.current = null; }
      if (redTimerRef.current) { clearTimeout(redTimerRef.current); redTimerRef.current = null; }
    };
  }, [socketStatus]);

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
    let timeout: ReturnType<typeof setTimeout>;
    if (rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING') {
      timeout = setTimeout(() => {
        Alert.alert('Aviso', 'No encontramos conductores disponibles en este momento. Inténtalo de nuevo en unos minutos.');
      }, 300000);
    }
    return () => clearTimeout(timeout);
  }, [rideStatus]);

  // FIX-10: limpiar el timer de reverseGeocode al desmontar el componente
  useEffect(() => {
    return () => {
      if (mapCenterReverseGeocodeTimer.current) {
        clearTimeout(mapCenterReverseGeocodeTimer.current);
        mapCenterReverseGeocodeTimer.current = null;
      }
    };
  }, []);

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
          // FIX-8: usar el pickupLocation seleccionado por el usuario en lugar de GPS crudo
          latitude: pickupLocation.latitude ?? location.coords.latitude,
          longitude: pickupLocation.longitude ?? location.coords.longitude,
          address: pickupLocation.displayName || 'Mi Ubicación Actual',
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
    const scale = interpolate(animatedIndex.value, [0, 1, 2], [1, 1, 0.96], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const handlePlaceSelect = useCallback((place: PlaceResult) => {
    if (activeMapField === 'pickup') {
       setPickupLocation(place);
       Keyboard.dismiss();
       bottomSheetRef.current?.snapToIndex(0);
       return;
    }
    
    // Default handles Destination
    setSelectedPlace(place);
    saveToHistory(place);
    Keyboard.dismiss();
    bottomSheetRef.current?.snapToIndex(0);
    setTimeout(() => {
      fareOfferSheetRef.current?.expand();
    }, 300);
  }, [saveToHistory, activeMapField]);

  const destinationCoord = React.useMemo(() => {
    if (selectedPlace && selectedPlace.latitude !== undefined && selectedPlace.longitude !== undefined) {
      return { latitude: selectedPlace.latitude, longitude: selectedPlace.longitude };
    }
    return undefined;
  }, [selectedPlace]);

  // Center Pin Overlay Visibility (legacy search-field pin — only when NOT in map-selection mode)
  const showCenterPin = isIdle && activeMapField !== null && currentSnapIndex < 2 && mapSelectionMode === 'none';

  return (
    <View style={styles.container}>
      {/* ── Background Map: interactive except when sheet is fully expanded ── */}
      <Animated.View
        style={[{ flex: 1, backgroundColor: '#0D0520' }, mapAnimatedStyle]}
        pointerEvents={currentSnapIndex === 2 ? 'none' : 'auto'}
      >
        {location ? (
          <MapRenderer
            ref={mapRef}
            latitude={location.coords.latitude}
            longitude={location.coords.longitude}
            title={t('general.locating')}
            destinationCoordinate={destinationCoord}
            onRegionChange={handleRegionChange}
            onRegionChangeComplete={handleRegionChangeComplete}
          />
        ) : showLocating ? (
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
        ) : null}
      </Animated.View>

      {/* ── Socket connection status banner ── */}
      {showBanner && bannerState !== 'hidden' && (
        <View style={[
          styles.connectionBanner,
          { backgroundColor: bannerState === 'amber' ? 'rgba(245,197,24,0.92)' : 'rgba(229,57,53,0.92)' }
        ]}>
          <Ionicons
            name={bannerState === 'amber' ? 'wifi-outline' : 'cloud-offline-outline'}
            size={14}
            color="#0D0520"
          />
          <Text style={styles.connectionBannerText}>
            {bannerState === 'amber' ? 'Reconectando…' : 'Sin conexión en tiempo real'}
          </Text>
        </View>
      )}

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
          <Text style={styles.topDriverBannerText}>Encontrando tu ride…</Text>
        </View>
      )}

      {/* ── MapPinOverlay: mode "Fijar en mapa" (new, full-featured) ── */}
      {mapSelectionMode !== 'none' && (
        <MapPinOverlay
          mode={mapSelectionMode}
          isDragging={isDragging}
          pendingAddress={pendingAddress}
          onConfirm={handleConfirmMapPoint}
          onCancel={() => {
            setMapSelectionMode('none');
            setPendingCoordinate(null);
            setPendingAddress('');
          }}
        />
      )}

      {/* ── Main BottomSheet ── */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        animatedIndex={animatedIndex}
        onChange={(idx) => setCurrentSnapIndex(idx)}
        backgroundStyle={{ backgroundColor: 'rgba(13,5,32,0.92)' }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.20)', width: 36, height: 4 }}
        keyboardBehavior="interactive"
        enablePanDownToClose={false}
      >
        <BottomSheetView
          style={{ flex: 1, paddingBottom: 32, paddingHorizontal: 16 }}
        >
          {/* SIEMPRE visible — no condicional (SearchBar/Autocomplete) evitamos desmontar componente para no perder el state de búsqueda */}
          <View style={{ flex: currentSnapIndex < 2 ? undefined : 1 }}>
              <Animated.View style={[styles.searchProtagonist, searchGlowStyle, { display: (isSearching || isActiveRide || currentSnapIndex === 2) ? 'none' : 'flex' }]}>
                {/* 2-part Search Bar maintaining exact visual layout but enabling separate taps */}
                <View style={[styles.searchInner, {flexDirection: 'row', alignItems: 'center'}]}>
                  <Ionicons name="search" size={20} color={activeMapField === 'destination' ? "#F5C518" : "rgba(255,255,255,0.5)"} style={{marginLeft: 16}} />
                  <View style={{flex: 1, paddingLeft: 12, paddingVertical: 6}}>
                    {/* Destination Trigger */}
                    <TouchableOpacity 
                       onPress={() => { setActiveMapField('destination'); bottomSheetRef.current?.snapToIndex(2); }}
                       hitSlop={{ top: 10, bottom: 5, left: 10, right: 10 }}
                    >
                      <Text style={{color: '#FFF', fontSize: 16, fontWeight: '500'}}>
                        {selectedPlace?.displayName || '¿A dónde te llevamos hoy?'}
                      </Text>
                    </TouchableOpacity>

                    {/* Pickup Trigger */}
                    <TouchableOpacity 
                       onPress={() => { setActiveMapField('pickup'); bottomSheetRef.current?.snapToIndex(2); }}
                       hitSlop={{ top: 5, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={{color: activeMapField === 'pickup' ? '#F5C518' : 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2}} numberOfLines={1}>
                        {pickupLocation.displayName}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Arrow button — same action as tapping the bar */}
                  <TouchableOpacity
                    style={[styles.searchRightArrow, {backgroundColor: activeMapField === 'destination' && selectedPlace ? '#F5C518' : 'rgba(245,197,24,0.3)'}]}
                    onPress={() => {
                        if (activeMapField === 'destination' && selectedPlace) {
                            fareOfferSheetRef.current?.expand();
                        } else {
                            setActiveMapField('destination');
                            bottomSheetRef.current?.snapToIndex(2);
                        }
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="arrow-forward" size={16} color="#0D0520" />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              {/* ── "Fijar en mapa" secondary button (visible only in idle/snap 0-1, not searching/riding) ── */}
              {isIdle && !isActiveRide && currentSnapIndex < 2 && mapSelectionMode === 'none' && (
                <TouchableOpacity
                  style={{
                    marginTop: 8,
                    alignSelf: 'center',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                  }}
                  onPress={() => {
                    setMapSelectionMode('pickup');
                    setPendingCoordinate(null);
                    setPendingAddress('');
                    bottomSheetRef.current?.snapToIndex(0);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pin" size={14} color="rgba(255,255,255,0.60)" />
                  <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 13 }}>Fijar en mapa</Text>
                </TouchableOpacity>
              )}
            
          {/* FIX-9: visibility via opacity+height en lugar de display:none para mantener estado del input montado */}
              <View style={{
                flex: 1,
                opacity: currentSnapIndex === 2 ? 1 : 0,
                height: currentSnapIndex === 2 ? undefined : 0,
                overflow: 'hidden',
              }}>
                <Text style={{color: '#F5C518', fontSize: 12, marginLeft: 8, marginBottom: 8, fontWeight: '600'}}>
                   {activeMapField === 'pickup' ? 'Buscando: Punto de Recogida' : 'Buscando: Destino'}
                </Text>
                <AddressAutocomplete
                  placeholder={activeMapField === 'pickup' ? "¿Dónde te recogemos?" : "¿A dónde te llevamos hoy?"}
                  onSelect={handlePlaceSelect}
                  userLat={pickupLocation.latitude || location?.coords.latitude}
                  userLng={pickupLocation.longitude || location?.coords.longitude}
                />
                <View style={styles.historyPanel}>
                  {rideHistory.length === 0 ? (
                    <Text style={styles.historyEmpty}>Tus destinos recientes aparecerán aquí</Text>
                  ) : (
                    rideHistory.map((item, idx) => (
                      <TouchableOpacity
                        key={item.placeId || idx}
                        style={[styles.historyItem, idx < rideHistory.length - 1 && styles.historyItemBorder]}
                        onPress={() => handlePlaceSelect(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.40)" style={{ marginRight: 12 }} />
                        <Text style={styles.historyText} numberOfLines={1}>{item.displayName}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            <Animated.View style={[{ overflow: 'hidden' }, useAnimatedStyle(() => {
              const opacity = interpolate(animatedIndex.value, [0, 1], [0, 1], Extrapolation.CLAMP);
              const height = animatedIndex.value < 1 && currentSnapIndex === 0 ? 0 : 'auto';
              return { opacity, height, display: isSearching || isActiveRide ? 'none' : 'flex' };
            })]}>
              <FavoritesList
                favorites={favorites}
                onSelect={(fav: Favorite) => {
                  const place: PlaceResult = {
                    displayName: fav.address,
                    placeId: fav.placeId || fav.id,
                    latitude: fav.latitude,
                    longitude: fav.longitude,
                  };
                  setSelectedPlace(place);
                  Haptics.selectionAsync();
                  bottomSheetRef.current?.snapToIndex(0);
                  setTimeout(() => {
                    fareOfferSheetRef.current?.expand();
                  }, 300);
                }}
                onAdd={() => setAddFavVisible(true)}
                onDelete={handleDeleteFav}
              />
            </Animated.View>

            {/* Removed Selected Destination Details Card */}
          </View>

          {/* Buscando Conductor */}
          {isSearching && (
            <View style={{ paddingTop: 16 }}>
              {(rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || (rideStatus === 'NEGOTIATING' && bids.length === 0)) && (
                <SearchingDriversView activeDriversCount={activeDriversCount} onCancel={handleCancelRequest} />
              )}
              {rideStatus === 'NEGOTIATING' && bids.length > 0 && (
                <View style={styles.searchingContainer}>
                  <Text style={styles.statusTitle}>¡Ofertas Recibidas!</Text>
                  <View style={{ marginTop: 8, paddingBottom: 20, width: '100%' }}>
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
          )}

          {/* Viaje Activo — GAP VISUAL 7: usa ActiveRidePanel */}
          {isActiveRide && (() => {
            // FIX-7B: usar activeRidePayload desde hook reactivo, no getState()
            const driver = activeRidePayload?.acceptedBid?.driver;
            return (
              <ActiveRidePanel
                status={rideStatus}
                driverName={driver?.name}
                driverPhotoUrl={driver?.avatarUrl}
                driverRating={driver?.avgRating}
                totalRatings={driver?.totalRatings}
                vehicleMake={driver?.vehicle?.make}
                vehicleModel={driver?.vehicle?.model}
                vehiclePlate={driver?.vehicle?.licensePlate}
                vehicleColor={driver?.vehicle?.color}
                onChatPress={() => setChatVisible(true)}
                onCallPress={() => {}}
                onSosPress={() => {}}
              />
            );
          })()}
        </BottomSheetView>
      </BottomSheet>

      {/* Sheets & Modals */}
      <ChatSheet rideId={currentRideId} myUserId={user?._id} visible={chatVisible} onClose={() => setChatVisible(false)} />
      <RatingModal visible={!!completedRide} targetName="el conductor" onSubmit={handleRateDriver} onSkip={handleSkipRating} />
      {/* GAP VISUAL 5: pass API prices + loadingQuotes */}
      <FareOfferSheet
          ref={fareOfferSheetRef}
          onClose={() => fareOfferSheetRef.current?.close()}
          onConfirm={(price, vehicle, payment) => {
             handleRequestRide(price, vehicle);
          }}
          suggestedPriceRange={{
            min: Math.max(15, Math.floor(distanceKm * 8)),
            max: Math.max(25, Math.floor(distanceKm * 14))
          }}
          destAddress={selectedPlace?.displayName}
          distanceKm={distanceKm}
          estimatedTimeMin={estimatedTimeMin}
          categoryOptions={categoryOptions}
          loadingQuotes={loadingQuotes}
      />
      {/* BUG 3: PaymentMethodSelector onSelect now calls setPaymentMethod */}
      {paymentSelectorVisible && (
        <PaymentMethodSelector
           visible={paymentSelectorVisible}
           onClose={() => setPaymentSelectorVisible(false)}
           onSelect={(method) => {
             useRideFlowStore.getState().setPaymentMethod(method);
             setPaymentSelectorVisible(false);
           }}
        />
      )}
      <AddFavoriteSheet
        visible={addFavVisible}
        onClose={() => setAddFavVisible(false)}
        onSaved={(fav) => setFavorites(prev => [...prev, fav])}
        userLat={location?.coords.latitude}
        userLng={location?.coords.longitude}
      />
    </View>
  );
}


// ─── Main styles ──────────────────────────────────────────────────────────────

const getStyles = (theme: Theme) => StyleSheet.create({
  searchProtagonist: {
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.40)',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
    marginBottom: 8,
    marginHorizontal: 2,
    elevation: 4,
  },
  searchInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchRightArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  // ── History panel ──
  historyPanel: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  historyItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  historyText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  historyEmpty: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(255,255,255,0.30)',
    paddingVertical: 20,
  },
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
  connectionBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 16,
    left: '10%',
    right: '10%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 999,
  },
  connectionBannerText: {
    color: '#0D0520',
    fontSize: 12,
    fontWeight: '700',
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
