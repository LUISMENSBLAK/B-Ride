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
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, interpolate, Extrapolation, withSequence, runOnJS, FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid'; // FIX-C02
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
import FareOfferSheet, { type FareOfferSheetRef } from './FareOfferSheet'; // FIX-C01: tipado
import RouteEditorSheet from './RouteEditorSheet';
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
// FIX-A06: tipado explícito + navegación notifications + FIX-M01: i18n strings
const TopBar = memo(({ userName, profilePhoto, onAvatarPress, onNotifPress, unreadNotifications = 0, theme, t }: {
  userName?: string;
  profilePhoto?: string;
  onAvatarPress?: () => void;
  onNotifPress?: () => void;
  unreadNotifications?: number;
  theme: any;
  t: (key: string, opts?: any) => string;
}) => {
  const insets = useSafeAreaInsets();
  const topPosition = Math.max(insets.top, 20) + 12;

  return (
    <View style={[topBarStyles.container, { top: topPosition }]}>
      <TouchableOpacity
        style={topBarStyles.leftSection}
        onPress={onAvatarPress}
        activeOpacity={0.8}
        accessibilityLabel={t('accessibility.profile', { defaultValue: 'Perfil' })}
        accessibilityRole="button"
      >
        {profilePhoto ? (
           <Image source={{ uri: profilePhoto }} style={topBarStyles.avatar} />
        ) : (
           <View style={[topBarStyles.avatar, { backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' }]}>
             <Text style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{firstName(userName)[0]}</Text>
           </View>
        )}
        <View style={topBarStyles.textBlock}>
          {/* FIX-M01: i18n greeting */}
          <Text style={topBarStyles.greeting}>
            {t('passenger.greetingPrefix', { name: firstName(userName), defaultValue: `Hola, ${firstName(userName)}` })} 👋
          </Text>
          <Text style={topBarStyles.subText}>
            {t('passenger.locationDetected', { defaultValue: 'Ubicación actual detectada' })}
          </Text>
        </View>
      </TouchableOpacity>
      
      {/* FIX-A06: navegación a Notifications + FIX-M06: 44×44pt touch target */}
      <TouchableOpacity
        style={topBarStyles.notifBtn}
        onPress={onNotifPress}
        accessibilityLabel={t('accessibility.notifications', { defaultValue: 'Notificaciones' })}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
        {/* FIX-A06: solo mostrar badge si hay notificaciones */}
        {unreadNotifications > 0 && <View style={topBarStyles.notifBadge} />}
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
    // FIX-M06: 44×44pt mínimo para touch target
    width: 44, height: 44, borderRadius: 22, 
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
  
  // Trip state centralizado
  const { status: rideStatus, setStatus: setRideStatus, rideId: currentRideId, setRideContext, bids, receiveBid, resetFlow, setActiveRide, paymentMethod } = useRideFlowStore();
  const activeRidePayload = useRideFlowStore(s => s.activeRidePayload);
  
  const isSearching = rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING';
  const isActiveRide = rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' || rideStatus === 'IN_PROGRESS' || rideStatus === 'ACTIVE' || rideStatus === 'MAPPED';
  const isIdle = rideStatus === 'IDLE';

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
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets(); // used by top banner and buttons
  const socketStatus = useSocketStore(s => s.status);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const fareOfferSheetRef = useRef<FareOfferSheetRef>(null); // FIX-C01: tipado correcto
  const [currentSnapIndex, setCurrentSnapIndex] = useState(0);
  const animatedIndex = useSharedValue(0);
  const [showLocating, setShowLocating] = useState(true);

  // MEJORA 3: Toast System
  const [toast, setToast] = useState<{ msg: string; type: 'info'|'error'|'success' } | null>(null);
  const showToast = useCallback((msg: string, type: 'info'|'error'|'success' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // --- UBER STYLE DUAL MAP SELECTOR ---
  const [activeMapField, setActiveMapField] = useState<'destination' | 'pickup' | null>(null);
  const [pickupLocation, setPickupLocation] = useState<PlaceResult>({
    displayName: 'Mi Ubicación Actual',
    placeId: 'default_pickup'
  });
  const [isMapDragging, setIsMapDragging] = useState(false);
  const mapCenterReverseGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── MAP SELECTION MODE ("Fijar en mapa") ──────────────────────────────────
  type MapSelectionMode = 'none' | 'pickup' | 'destination';
  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionMode>('none');
  const [pendingCoordinate, setPendingCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  // Custom pickup override (set via map, used instead of GPS in ride request)
  const [pickupOverride, setPickupOverride] = useState<{ latitude: number; longitude: number; address: string } | null>(null);
  // Whether we entered map-pickup mode from FareOfferSheet (so we can return to it)
  const [isEditingOriginFromSheet, setIsEditingOriginFromSheet] = useState(false);

  // REDISEÑO 3: Pickup Banner
  const [showPickupBanner, setShowPickupBanner] = useState(false);
  const pickupBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapSelectionGeocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // FIX-A04: ref para leer selectedPlace desde handleRegionChangeComplete sin hoisting issue
  const selectedPlaceRef = useRef<PlaceResult | null>(null);

  const enterMapSelectionMode = useCallback((mode: 'pickup' | 'destination') => {
    setActiveMapField(null);
    Keyboard.dismiss();
    setMapSelectionMode(mode);
    setPendingCoordinate(null);
    setPendingAddress('');
    bottomSheetRef.current?.snapToIndex(0);
  }, []);

  const handleRegionChange = useCallback(() => {
    setIsMapDragging(true);
    if (mapCenterReverseGeocodeTimer.current) {
      clearTimeout(mapCenterReverseGeocodeTimer.current);
    }
    if (mapSelectionMode !== 'none') setIsDragging(true);

    // Mostrar banner solo en IDLE sin modo de selección activo y en el snap 0
    if (isIdle && mapSelectionMode === 'none' && currentSnapIndex === 0 && !!selectedPlace) {
      setShowPickupBanner(true);
      if (pickupBannerTimer.current) clearTimeout(pickupBannerTimer.current);
      pickupBannerTimer.current = setTimeout(() => setShowPickupBanner(false), 4000);
    }
  }, [mapSelectionMode, isIdle, currentSnapIndex]);

  const handleRegionChangeComplete = useCallback(async (region: any) => {
    setIsMapDragging(false);
    setIsDragging(false);

    // ── Map-selection mode: capture pending coord + debounce reverse geocode ──
    if (mapSelectionMode !== 'none') {
      setPendingCoordinate({ latitude: region.latitude, longitude: region.longitude });
      setPendingAddress('');
      if (mapSelectionGeocodeTimer.current) clearTimeout(mapSelectionGeocodeTimer.current);
      mapSelectionGeocodeTimer.current = setTimeout(async () => {
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
      }, 600);
      return;
    }

    if (!activeMapField || selectedPlaceRef.current) return;
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

  // BUG-007: BackHandler mejorado — 3 niveles de prioridad
  useEffect(() => {
    const handleBack = () => {
      // Prioridad 1: cancelar selección en mapa
      if (mapSelectionMode !== 'none') {
        setMapSelectionMode('none');
        setPendingCoordinate(null);
        setPendingAddress('');
        return true;
      }
      // Prioridad 2: cerrar campo de búsqueda activo
      if (activeMapField !== null) {
        setActiveMapField(null);
        bottomSheetRef.current?.snapToIndex(0);
        Keyboard.dismiss();
        return true;
      }
      // Prioridad 3: colapsar sheet si está completamente expandido
      if (currentSnapIndex === 2) {
        bottomSheetRef.current?.snapToIndex(0);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [mapSelectionMode, activeMapField, currentSnapIndex]);

  // Auto-cerrar FareOfferSheet cuando se acepta un ride o se cancela el flujo
  useEffect(() => {
    if (rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING') {
      fareOfferSheetRef.current?.close();
    }
  }, [rideStatus]);

  useEffect(() => {
    const timer = setTimeout(() => setShowLocating(false), 8000); // BUG-016: timeout 8s para GPS frío
    return () => clearTimeout(timer);
  }, []);

  // ─── BackHandler removed here per request ───

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
      setPickupOverride({
        latitude: pendingCoordinate.latitude,
        longitude: pendingCoordinate.longitude,
        address: pendingAddress || 'Ubicación en el mapa',
      });
      
      if (isEditingOriginFromSheet) {
        // Volver al FareOfferSheet con el nuevo origen
        setIsEditingOriginFromSheet(false);
        setMapSelectionMode('none');
        setPendingCoordinate(null);
        bottomSheetRef.current?.snapToIndex(0);
        setTimeout(() => fareOfferSheetRef.current?.expand(), 400); // FIX: Ensure animation finishes
        setPendingCoordinate(null);
        setPendingAddress('');
        setMapSelectionMode('none');
      }
    } else {
      setSelectedPlace(place);
      saveToHistory(place);
      setMapSelectionMode('none');
      setPendingCoordinate(null);
      setPendingAddress('');
      bottomSheetRef.current?.snapToIndex(0);
      setTimeout(() => fareOfferSheetRef.current?.expand(), 400);
    }
  }, [pendingCoordinate, pendingAddress, mapSelectionMode, saveToHistory, isEditingOriginFromSheet]);

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


  // BUG-032: searchModalVisible eliminado (estado huérfano, no se usa en JSX)



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


  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  // Mantener ref sincronizado con el estado
  useEffect(() => { selectedPlaceRef.current = selectedPlace; }, [selectedPlace]);
  const [price, setPrice] = useState('');
  const [completedRide, setCompletedRide] = useState<RideData | null>(null);
  const [acceptingBidId, setAcceptingBidId] = useState<string | null>(null);
  const [paymentAuthorizing, setPaymentAuthorizing] = useState<boolean>(false);
  const [paymentStatusText, setPaymentStatusText] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [estimatedTimeMin, setEstimatedTimeMin] = useState<number>(0);

  // Price sheet states (only category options, removed orphan visible state)
  const [categoryOptions, setCategoryOptions] = useState<any>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  // Route editor modal
  const [routeEditorVisible, setRouteEditorVisible] = useState(false);
  const [routeEditorInitialField, setRouteEditorInitialField] = useState<'origin' | 'dest'>('dest');

  // Promos y agendado
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState<{type: string, value: number} | null>(null);
  const [promoApplying, setPromoApplying] = useState(false);
  // BUG-012: promoInputOpen eliminado (estado huérfano)
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

  // FIX-C04: Mutex ref para detectar cancel duplicado (ride:cancelled vs trip_state_changed)
  const cancellationHandledRef = useRef(false);

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
  }, [t]); // BUG-017: t en deps para evitar stale closure

  // FIX-C05: GPS init con isMounted en el mismo closure — elimina el leak
  // checkLocationStatus se mantiene como callback público únicamente para el botón de retry en UI
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

    (async () => {
      try {
        setErrorMsg(null);
        const providerStatus = await Location.getProviderStatusAsync();
        if (!providerStatus.locationServicesEnabled) {
          if (isMounted) setErrorMsg(t('passenger.gpsDisabled', { defaultValue: 'Por favor, activa el GPS de tu dispositivo para continuar.' }));
          return;
        }
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;
        if (status !== 'granted') {
          if (isMounted) setErrorMsg(t('passenger.permissionDenied', { defaultValue: 'Permiso de ubicación denegado. Se requiere para pedir un ride.' }));
          return;
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!isMounted) return;
        setLocation(loc);
        // FIX-C05: timeInterval relajado en IDLE para ahorrar batería
        locationSubscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 30 },
          (newLoc) => { if (isMounted) setLocation(newLoc); }
        );
      } catch (error: unknown) {
        if (isMounted) setErrorMsg(t('passenger.locationServiceError', { defaultValue: 'No pudimos obtener tu ubicación. Verifica tu conexión a internet.' }));
      }
    })();

    return () => {
      isMounted = false;
      locationSubscription?.remove();
      sub.remove();
    };
  }, []); // Solo en mount — no depende de checkLocationStatus

  // FIX-M08: GPS Adaptativo — watcher se recrea con intervals dinámicos según rideStatus
  const activeAdaptiveWatcherRef = useRef<Location.LocationSubscription | null>(null);
  useEffect(() => {
    const isActiveRide = rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' || rideStatus === 'IN_PROGRESS';
    const isSearching = rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING' || rideStatus === 'REQUESTING';

    if (!isActiveRide && !isSearching) {
      activeAdaptiveWatcherRef.current?.remove();
      activeAdaptiveWatcherRef.current = null;
      return;
    }

    const timeInterval = isActiveRide ? 5000 : 10000;
    const distanceInterval = isActiveRide ? 5 : 15;

    let cancelled = false;
    (async () => {
      activeAdaptiveWatcherRef.current?.remove();
      activeAdaptiveWatcherRef.current = null;
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval, distanceInterval },
        (newLoc) => { if (!cancelled) setLocation(newLoc); }
      );
      if (cancelled) { sub.remove(); return; }
      activeAdaptiveWatcherRef.current = sub;
    })();

    return () => {
      cancelled = true;
      activeAdaptiveWatcherRef.current?.remove();
      activeAdaptiveWatcherRef.current = null;
    };
  }, [rideStatus]);



  // Timeout para cancelar la busqueda de conductores automaticamente con 5 min (300,000s)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    if (rideStatus === 'SEARCHING' || rideStatus === 'NEGOTIATING') {
      timeout = setTimeout(() => {
        showToast(t('passenger.noDriversTimeout'), 'info');
      }, 300000);
    }
    return () => clearTimeout(timeout);
  }, [rideStatus]);

  // FIX-10: limpiar timers de geocode y banner al desmontar el componente
  useEffect(() => {
    return () => {
      if (mapCenterReverseGeocodeTimer.current) {
        clearTimeout(mapCenterReverseGeocodeTimer.current);
        mapCenterReverseGeocodeTimer.current = null;
      }
      if (mapSelectionGeocodeTimer.current) {
        clearTimeout(mapSelectionGeocodeTimer.current);
        mapSelectionGeocodeTimer.current = null;
      }
      if (pickupBannerTimer.current) {
        clearTimeout(pickupBannerTimer.current);
        pickupBannerTimer.current = null;
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
    bottomSheetRef.current?.snapToIndex(1); // BUG 6: Manual snap
  }, []));

  useRideSocketEvent('no_drivers_available', useCallback((data: any) => {
    showToast(data?.message || t('passenger.noDriversTitle'), 'info');
    resetFlow();
    setPrice('');
    bottomSheetRef.current?.snapToIndex(0);
  }, [showToast, t]));

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
        setShowPickupBanner(false);
        setMapSelectionMode('none');
        setPendingCoordinate(null);
        setPendingAddress('');
        bottomSheetRef.current?.snapToIndex(0); // BUG 6: Manual snap on finish
        navigation.navigate('PassengerPayment', {
          price: finalPrice,
          rideId: updatedRide?._id,
          status: 'COMPLETED'
        });
      } else {
        // FIX-C04: Usar mutex para no duplicar Alert si ride:cancelled ya lo manejó
        if (!cancellationHandledRef.current) {
          cancellationHandledRef.current = true;
          setTimeout(() => { cancellationHandledRef.current = false; }, 2000);
          Alert.alert(t('errors.rideCancelled'), t('errors.driverCancelled'));
        }
        stopTracking();
        resetFlow();
        setPrice('');
        setAcceptingBidId(null);
        setSelectedPlace(null);
        setShowPickupBanner(false);
        setMapSelectionMode('none');
        setPendingCoordinate(null);
        setPendingAddress('');
        bottomSheetRef.current?.snapToIndex(0); // BUG-005: colapsar al 25%, no al 50%
      }
    }
  }, [stopTracking]));

  useRideSocketEvent('driverLocationUpdate', useCallback((locData) => {
    pushLocation(locData.latitude, locData.longitude);
  }, [pushLocation]));

  useRideSocketEvent('rideError', useCallback((error) => {
    Alert.alert(t('passenger.connectionError'), error.message);
    resetFlow();
    setAcceptingBidId(null);
  }, []));

  useRideSocketEvent('driver_warning', useCallback((data: any) => {
    Alert.alert(t('passenger.driverWarning'), data?.message || t('passenger.driverWarningDefault'));
  }, []));

  useRideSocketEvent('driver_disconnected', useCallback((data: any) => {
    Alert.alert(
      t('passenger.driverDisconnectedTitle'),
      t('passenger.driverDisconnectedMsg'),
      [
        { text: 'OK', style: 'default' },
        { text: 'SOS', style: 'destructive', onPress: () => {} },
      ]
    );
  }, []));

  useRideSocketEvent('rating_submitted', useCallback(({ newAvg }) => {
    showToast(t('passenger.ratingThanksMsg', { avg: newAvg }), 'success');
  }, []));

  useRideSocketEvent('ride:cancelled', useCallback(({ rideId }) => {
    // FIX-C04: Guard mutex — evitar doble ejecución con trip_state_changed
    if (cancellationHandledRef.current) return;
    cancellationHandledRef.current = true;
    // Resetear después de procesarlo para que el próximo viaje pueda cancelarse normalmente
    setTimeout(() => { cancellationHandledRef.current = false; }, 2000);

    stopTracking();
    resetFlow();
    setPrice('');
    setAcceptingBidId(null);
    setSelectedPlace(null);
    setDistanceKm(0);
    setEstimatedTimeMin(0);
    setShowPickupBanner(false);
    setMapSelectionMode('none');
    setPendingCoordinate(null);
    setPendingAddress('');
    socketService.setRideRoom(null);
    bottomSheetRef.current?.snapToIndex(0); // BUG-005: colapsar al 25% tras cancelación
    Alert.alert(t('passenger.rideCancel'), t('passenger.rideCancelMsg'));
  }, [stopTracking]));

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRequestRide = useCallback(async (finalPrice: number, finalCategory: any) => {
    // BUG-020: verificar URL válida (no solo existencia del campo)
    const hasPhoto = !!(
      user?.avatarUrl?.startsWith('http') ||
      user?.profilePhoto?.startsWith('http') ||
      (user as any)?.picture?.startsWith('http')
    );
    if (!hasPhoto) {
      Alert.alert(
        t('passenger.photoRequired'),
        t('passenger.photoRequiredMsg'),
        [
          { text: t('settings.cancel'), style: 'cancel' },
          { text: t('passenger.uploadPhoto'), onPress: () => navigation.navigate('PassengerProfile') }
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
    // FIX-C01: Eliminado setPriceSheetVisible(false) — no existe, se controla con fareOfferSheetRef
    setRideStatus('REQUESTING');
    try {
      // FIX-C02: eventId único por request + 1 reintento con timeout 8s
      const eventId = uuidv4();
      await socketService.emitWithAck('requestRide', {
        passengerId: user?._id,
        eventId,
        pickupLocation: {
          latitude: pickupOverride?.latitude ?? pickupLocation.latitude ?? location.coords.latitude,
          longitude: pickupOverride?.longitude ?? pickupLocation.longitude ?? location.coords.longitude,
          address: pickupOverride?.address ?? pickupLocation.displayName ?? 'Mi Ubicación Actual',
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
      }, 1, 8000); // FIX-C02: máximo 1 reintento, timeout 8s
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; response?: any };
      Alert.alert(t('passenger.connectionError'), err.message || t('passenger.connectionErrorMsg'));
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
        Alert.alert(t('passenger.paymentStopped'), err.message || t('errors.paymentFailed'));
        setAcceptingBidId(null);
      } finally {
        setPaymentAuthorizing(false);
        setPaymentStatusText(null);
      }
    }
  }, [currentRideId, user, acceptingBidId, paymentAuthorizing, initPaymentSheet, presentPaymentSheet]);

  const validateAndSetPickup = useCallback((place: PlaceResult) => {
    setPickupLocation(place);
    if (place.latitude && place.longitude) {
      setPickupOverride({
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.displayName,
      });
    }
  }, []);

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
    setShowPickupBanner(false);
    setMapSelectionMode('none');
    setPendingCoordinate(null);
    setPendingAddress('');
    bottomSheetRef.current?.snapToIndex(0); // BUG-005: colapsar al 25% tras cancelación manual
  }, [user]);

  const handleApplyPromo = async () => {
    if (!promoCode) return;
    setPromoApplying(true);
    try {
      const res = await client.post('/promos/validate', { code: promoCode, rideValue: convertToUsd(Number(price)) });
      if (res.data.success) {
        setPromoDiscount({ type: res.data.data.type, value: res.data.data.value });
        showToast(t('passenger.promoAppliedMsg'), 'success');
      } else {
        // BUG-038: guard NaN — solo actualizar si el precio es válido
        const newPrice = res.data?.price;
        if (typeof newPrice === 'number' && !isNaN(newPrice) && newPrice > 0) {
          setPrice(String(convertToUsd(newPrice)));
        }
        // Si no hay precio válido, mantener el precio sugerido previo
      }
    } catch (error: unknown) {
      const err = error as { message?: string; code?: string; response?: any };
      showToast(err.response?.data?.message || 'Código inválido.', 'error');
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



  const bestBidId = bids.length > 0 ? bids[0]._id : null;

  // Determine bottom sheet snap points (BUG 6: constant snapPoints)
  const snapPoints = React.useMemo(() => ['25%', '60%', '92%'], []);

  // BUG 8: Translation strings
  const activeStatusLabel = () => {
    if (rideStatus === 'ARRIVED') return t('ride.arrivedTitle');
    if (rideStatus === 'IN_PROGRESS') return t('ride.inProgress');
    return t('ride.enRoute');
  };

  // ─── Map Animated Scale ──────────────────────────────────────────────────
  const mapAnimatedStyle = useAnimatedStyle(() => {
    // Escala 1.0 en snappoints 0 y 1 ('25%', '60%'), 0.96 en snappoint 2 ('92%')
    const scale = interpolate(animatedIndex.value, [0, 1, 2], [1, 1, 0.96], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const favoritesAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(animatedIndex.value, [0, 1, 2], [0, 1, 0], Extrapolation.CLAMP);
    const maxHeight = interpolate(animatedIndex.value, [0, 1, 2], [0, 200, 0], Extrapolation.CLAMP);
    return { opacity, maxHeight };
  });

  const confirmBtnScale = useSharedValue(1);
  const confirmBtnAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: confirmBtnScale.value }]
  }));

  const handlePlaceSelect = useCallback((place: PlaceResult) => {
    setActiveMapField(null);
    if (activeMapField === 'pickup') {
      validateAndSetPickup(place);
      Keyboard.dismiss();
      bottomSheetRef.current?.snapToIndex(1);
      return;
    }
    setSelectedPlace(place);
    saveToHistory(place);
    Keyboard.dismiss();
    
    // Auto-open FareOfferSheet immediately if origin & dest are set
    if (pickupLocation.latitude && pickupLocation.longitude && place.latitude && place.longitude) {
       bottomSheetRef.current?.snapToIndex(0);
       setTimeout(() => fareOfferSheetRef.current?.expand(), 400);
       return;
    }
    
    bottomSheetRef.current?.snapToIndex(1);
  }, [saveToHistory, activeMapField, pickupLocation, validateAndSetPickup]);

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
        ) : (
          // BUG-016: mostrar loader incluso después del timeout si no hay location ni error
          !errorMsg ? (
            <View style={styles.loaderContainer}>
              <Loader label={t('general.locating')} />
            </View>
          ) : (
            <View style={styles.loaderContainer}>
              <View style={styles.errorCard}>
                <Ionicons name="location" size={48} color={theme.colors.error} style={{ marginBottom: 14 }} />
                <Text style={styles.errorTitle}>{t('general.locationFailed')}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={checkLocationStatus}>
                  <Text style={styles.retryBtnText}>{t('history.retry')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        )}
      </Animated.View>

      {/* MEJORA 3: Toast Local */}
      {toast && (
        <Animated.View style={{
          position: 'absolute',
          top: insets.top + 120,
          left: 20, right: 20,
          backgroundColor: toast.type === 'error'
            ? 'rgba(229,57,53,0.92)'
            : toast.type === 'success'
            ? 'rgba(57,199,122,0.92)'
            : 'rgba(13,5,32,0.92)',
          borderRadius: 16,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderWidth: 1,
          borderColor: toast.type === 'error'
            ? 'rgba(229,57,53,0.50)'
            : toast.type === 'success'
            ? 'rgba(57,199,122,0.50)'
            : 'rgba(255,255,255,0.12)',
          zIndex: 500,
          alignItems: 'center',
        }}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessible={true}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
            {toast.msg}
          </Text>
        </Animated.View>
      )}

      {/* ── Socket connection status banner ── */}
      {showBanner && bannerState !== 'hidden' && (
        <View style={[
          styles.connectionBanner,
          { top: insets.top + 60 },
          { backgroundColor: bannerState === 'amber' ? 'rgba(245,197,24,0.92)' : 'rgba(229,57,53,0.92)' }
        ]}>
          <Ionicons
            name={bannerState === 'amber' ? 'wifi-outline' : 'cloud-offline-outline'}
            size={14}
            color="#0D0520"
          />
          <Text style={styles.connectionBannerText}>
            {bannerState === 'amber' ? t('passenger.reconnecting') : t('passenger.noConnection')}
          </Text>
        </View>
      )}

      {/* ── TopBar: siempre visible cuando hay usuario ── */}
      {!!user && (
        <TopBar
          userName={user?.name}
          profilePhoto={user?.profilePhoto || user?.avatarUrl}
          onAvatarPress={() => navigation.navigate('PassengerProfile')}
          onNotifPress={() => {
            // BUG-001: Notifications pantalla no existe — Alert temporal para evitar crash
            Alert.alert(
              t('general.comingSoon', { defaultValue: 'Próximamente' }),
              t('general.notificationsComingSoon', { defaultValue: 'El sistema de notificaciones estará disponible en la próxima versión.' })
            );
          }}
          unreadNotifications={0} // FIX-A06: extensible sin badge hasta que haya notif system
          theme={theme}
          t={t}
        />
      )}

      {/* ── DriverPill: solo en IDLE ── */}
      {isIdle && (
        <DriverPill count={activeDriversCount} animatedIndex={animatedIndex} />
      )}

      {/* Driver found banner (during SEARCHING) */}
      {showDriverBanner && (
        <View style={styles.topDriverBanner}>
          <View style={styles.topDriverBannerDot} />
          <Text style={styles.topDriverBannerText}>{t('passenger.findingRide')}</Text>
        </View>
      )}

      {/* BUG-1 FIX: Pin full-screen absolute container — FUERA de ScrollView/BottomSheet.
           pointerEvents="none" garantiza que los toques pasen al mapa. */}
      {(mapSelectionMode !== 'none' || showCenterPin) && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 120,
            zIndex: 55,
          }}
        >
          <MapPinOverlay
            mode={mapSelectionMode}
            isDragging={isDragging}
            pendingAddress={pendingAddress}
          />
        </View>
      )}

      {/* FIX 2 — BANNER SUPERIOR */}
      {mapSelectionMode !== 'none' && (
        <Animated.View
          entering={FadeIn.duration(300)}
          style={{
            position: 'absolute',
            top: insets.top + 70,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'rgba(13,5,32,0.82)',
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderWidth: 1,
            borderColor: 'rgba(245,197,24,0.30)',
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            zIndex: 70,
          }}
          pointerEvents="none"
        >
          <Ionicons name="navigate-circle-outline" size={16} color="#F5C518" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
            Mueve el mapa para ajustar
          </Text>
        </Animated.View>
      )}
      {showPickupBanner && rideStatus === 'IDLE' && mapSelectionMode === 'none' && (
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(300)}
          style={{
            position: 'absolute',
            bottom: 120, // encima del bottom sheet
            left: 20, right: 20,
            backgroundColor: 'rgba(13,5,32,0.92)',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: 'rgba(245,197,24,0.30)',
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 12,
            zIndex: 100,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
              ¿Te recogemos aquí?
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.50)', fontSize: 12, marginTop: 2 }}>
              Mueve el mapa para ajustar
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setShowPickupBanner(false);
              enterMapSelectionMode('pickup');
            }}
            style={{
              backgroundColor: '#F5C518',
              paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 10,
            }}>
            <Text style={{ color: '#0D0520', fontWeight: '800', fontSize: 13 }}>
              Sí, aquí
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setShowPickupBanner(false);
              setPickupOverride(null);
            }}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>
        </Animated.View>
      )}

      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        animatedIndex={animatedIndex}
        onChange={(idx) => { setCurrentSnapIndex(idx); if (idx < 2) setActiveMapField(null); }}
        backgroundStyle={{ backgroundColor: theme.isDark ? '#1E0B3E' : theme.colors.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.colors.textMuted, width: 36, height: 4 }}
        keyboardBehavior="interactive"
        enablePanDownToClose={false}
      >
        <BottomSheetView
          style={{ flex: 1, paddingBottom: 32, paddingHorizontal: 16 }}
        >
          {/* FIX 3: En modo mapa mostrar solo tarjeta de confirmación */}
          {mapSelectionMode !== 'none' ? (
            <Animated.View
              entering={FadeIn.duration(350)}
              style={{
                width: '100%',
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 4,
              }}
            >
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: 'rgba(245,197,24,0.15)',
                  borderWidth: 1, borderColor: 'rgba(245,197,24,0.30)',
                  justifyContent: 'center', alignItems: 'center'
                }}>
                  <Ionicons name="location" size={18} color="#F5C518" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textMuted, 
                    fontSize: 11, fontWeight: '600', 
                    textTransform: 'uppercase', letterSpacing: 1 }}>
                    {mapSelectionMode === 'pickup' ? t('passenger.pickupUppercase', { defaultValue: 'Recogida' }) : t('passenger.destUppercase', { defaultValue: 'Destino' })}
                  </Text>
                  <Text style={{ color: '#FFFFFF', fontSize: 16, 
                    fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                    {pendingAddress || t('passenger.calculatingAddress', { defaultValue: 'Buscando dirección...' })}
                  </Text>
                </View>
              </View>

              {/* Botón Confirmar */}
              <Animated.View style={confirmBtnAnimatedStyle}>
                <TouchableOpacity
                  disabled={isDragging || !pendingCoordinate}
                  onPress={handleConfirmMapPoint}
                  onPressIn={() => confirmBtnScale.value = withSpring(0.97)}
                  onPressOut={() => confirmBtnScale.value = withSpring(1)}
                  style={{
                    flexDirection: 'row',
                    alignSelf: 'center',
                    paddingHorizontal: 28,
                    paddingVertical: 13,
                    borderRadius: 999,
                    backgroundColor: (isDragging || !pendingCoordinate) ? 'rgba(255,255,255,0.08)' : '#F5C518',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minWidth: 200,
                  }}
                  activeOpacity={1}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '800',
                    color: (isDragging || !pendingCoordinate)
                      ? 'rgba(255,255,255,0.30)' : '#0D0520',
                  }}>
                    {isDragging
                      ? t('passenger.releaseToConfirm', { defaultValue: 'Suelta aquí...' })
                      : mapSelectionMode === 'pickup'
                        ? t('passenger.confirmPickup', { defaultValue: 'Confirmar recogida' })
                        : t('passenger.confirmDest', { defaultValue: 'Confirmar destino' })}
                  </Text>
                  <Ionicons 
                    name={isDragging ? "hand-left-outline" : "checkmark-circle"} 
                    size={20} 
                    color={(isDragging || !pendingCoordinate) ? 'rgba(255,255,255,0.30)' : '#0D0520'} 
                    style={{ marginLeft: 8 }} 
                  />
                </TouchableOpacity>
              </Animated.View>

              {/* Botón Cancelar */}
              <TouchableOpacity
                onPress={() => {
                  setMapSelectionMode('none');
                  setPendingCoordinate(null);
                  setPendingAddress('');
                }}
                style={{
                  marginTop: 12,
                  backgroundColor: 'transparent',
                  borderWidth: 1, 
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderRadius: 999,
                  paddingHorizontal: 24, 
                  paddingVertical: 10,
                  alignSelf: 'center',
                }}
              >
                <Text style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 14,
                  fontWeight: '600',
                }}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
          <>
          {/* SIEMPRE visible — no condicional (SearchBar/Autocomplete) evitamos desmontar componente para no perder el state de búsqueda */}
          <View style={{ flex: currentSnapIndex < 2 ? undefined : 1 }}>
              {/* Micro-label context */}
              {!isSearching && !isActiveRide && (
                <Text style={{
                  fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase',
                  color: theme.colors.textMuted, marginBottom: 6, marginLeft: 4
                }}>
                  {selectedPlace ? `→ ${selectedPlace.displayName.split(',')[0]}` : '¿A dónde vamos?'}
                </Text>
              )}
              <Animated.View style={[styles.searchProtagonist, searchGlowStyle, { display: (isSearching || isActiveRide || currentSnapIndex === 2) ? 'none' : 'flex' }]}>
                {/* 2-part Search Bar maintaining exact visual layout but enabling separate taps */}
                <View style={[styles.searchInner, {flexDirection: 'row', alignItems: 'center'}]}>
                  <Ionicons 
                    name={selectedPlace ? "checkmark-circle" : "search"} 
                    size={20} 
                    color={selectedPlace ? theme.colors.success : (activeMapField ? theme.colors.primary : theme.colors.textMuted)} 
                    style={{marginLeft: 16}} 
                  />
                  <View style={{flex: 1, paddingLeft: 12, paddingVertical: 6}}>
                    {activeMapField === 'pickup' ? (
                      <TouchableOpacity 
                         onPress={() => { setActiveMapField('pickup'); bottomSheetRef.current?.snapToIndex(2); }}
                         hitSlop={{ top: 5, bottom: 10, left: 10, right: 10 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3D8EF0', borderWidth: 2, borderColor: theme.colors.surface, marginRight: 10 }} />
                          <Text style={{color: theme.colors.text, fontSize: 16, fontWeight: '500'}} numberOfLines={1}>
                            {pickupLocation.displayName || t('passenger.searchingPickup')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                         onPress={() => { setActiveMapField('destination'); bottomSheetRef.current?.snapToIndex(2); }}
                         hitSlop={{ top: 10, bottom: 5, left: 10, right: 10 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#F5C518', marginRight: 10 }} />
                          <Text style={{color: theme.colors.text, fontSize: 16, fontWeight: '500'}} numberOfLines={1}>
                            {selectedPlace?.displayName || t('passenger.searchingDest')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Flecha amarilla: activa si hay destino seleccionado, abre FareOfferSheet */}
                  <TouchableOpacity
                    style={[styles.searchRightArrow, {
                      backgroundColor: selectedPlace ? '#F5C518' : 'rgba(245,197,24,0.20)',
                      borderWidth: selectedPlace ? 0 : 1,
                      borderColor: 'rgba(245,197,24,0.50)',
                      opacity: 1,
                    }]}
                    onPress={() => {
                        if (selectedPlace) {
                          // Hay destino → cerrar sheet de búsqueda y abrir FareOfferSheet
                          Keyboard.dismiss();
                          bottomSheetRef.current?.snapToIndex(0);
                          setTimeout(() => fareOfferSheetRef.current?.expand(), 400); // BUG-039
                        } else {
                          // Sin destino → mostrar toast
                          showToast('Primero selecciona un destino', 'error');
                        }
                    }}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityLabel={selectedPlace
                      ? t('passenger.openFareOffer', { defaultValue: 'Ver opciones de viaje' })
                      : t('passenger.searchDest', { defaultValue: 'Buscar destino' })}
                    accessibilityRole="button"
                  >
                    <Ionicons name={selectedPlace ? 'arrow-forward' : 'search'} size={16} color="#0D0520" />
                  </TouchableOpacity>
                </View>
              </Animated.View>

              {/* BUG-2 FIX: "Fijar en mapa" como botón flotante SOBRE el sheet,
                   position absolute — nunca dentro de ScrollView */}
            
          {/* FIX-9: visibility via opacity+height en lugar de display:none para mantener estado del input montado */}
              <View style={{
                flex: 1,
                display: currentSnapIndex < 1 ? 'none' : 'flex',
                overflow: 'hidden',
              }}>
                <AddressAutocomplete
                  placeholder={activeMapField === 'pickup' ? t('passenger.searchingPickup') : t('passenger.searchingDest')}
                  onSelect={handlePlaceSelect}
                  userLat={pickupLocation.latitude || location?.coords.latitude}
                  userLng={pickupLocation.longitude || location?.coords.longitude}
                />
                <View style={[styles.historyPanel, { marginTop: 12 }]}>
                  {/* CAMBIO 2: Fijar en mapa iterativo */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      gap: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                    }}
                    onPress={() => enterMapSelectionMode(activeMapField || 'destination')}
                    activeOpacity={0.7}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: 'rgba(245,197,24,0.12)',
                      borderWidth: 1, borderColor: 'rgba(245,197,24,0.25)',
                      justifyContent: 'center', alignItems: 'center'
                    }}>
                      <Ionicons name="pin-outline" size={18} color="#F5C518" />
                    </View>
                    <View>
                      <Text style={{ color: theme.isDark ? theme.colors.text : '#0D0520', fontSize: 15, fontWeight: '600' }}>{t('passenger.fixOnMap')}</Text>
                      <Text style={{ color: theme.isDark ? theme.colors.textMuted : '#5E548E', fontSize: 13, marginTop: 2 }}>Elige un punto directamente en el mapa</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={{
                    marginHorizontal: 16,
                    marginVertical: 8,
                    height: 1,
                    backgroundColor: theme.colors.border,
                  }} />

                  {rideHistory.length === 0 ? (
                    <Text style={styles.historyEmpty}>{t('passenger.noRecentDestinations', { defaultValue: 'Tus destinos recientes aparecérán aquí' })}</Text>
                  ) : (
                    rideHistory.map((item, idx) => (
                      <TouchableOpacity
                        key={item.placeId || idx}
                        style={[styles.historyItem, idx < rideHistory.length - 1 && styles.historyItemBorder]}
                        onPress={() => handlePlaceSelect(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={18} color={theme.isDark ? theme.colors.textMuted : '#5E548E'} style={{ marginRight: 12 }} />
                        <Text style={styles.historyText} numberOfLines={1}>{item.displayName}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            <Animated.View style={[{ overflow: 'hidden' }, favoritesAnimatedStyle]}>
              {!isSearching && !isActiveRide && (
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
                    setTimeout(() => fareOfferSheetRef.current?.expand(), 400);
                  }}
                  onAdd={() => setAddFavVisible(true)}
                  onDelete={handleDeleteFav}
                />
              )}
            </Animated.View>

            {/* Removed Selected Destination Details Card */}
          </View>
          </>
          )}


          {/* Buscando Conductor */}
          {isSearching && (
            <View style={{ paddingTop: 16 }}>
              {(rideStatus === 'REQUESTING' || rideStatus === 'REQUESTED' || rideStatus === 'SEARCHING' || (rideStatus === 'NEGOTIATING' && bids.length === 0)) && (
                <SearchingDriversView activeDriversCount={activeDriversCount} onCancel={handleCancelRequest} />
              )}
              {rideStatus === 'NEGOTIATING' && bids.length > 0 && (
                <View style={styles.searchingContainer}>
                  <Text style={styles.statusTitle}>{t('passenger.bidsReceived', { defaultValue: '¡Ofertas Recibidas!' })}</Text>
                  <View style={{ marginTop: 8, paddingBottom: 20, width: '100%' }}>
                    {bids.map((item: any) => (
                      <BidCard key={item._id} bid={item} isBest={item._id === bestBidId} onAccept={handleAcceptBid} />
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.cancelRequestBtn}
                    onPress={handleCancelRequest}
                    accessibilityLabel={t('accessibility.cancelRide', { defaultValue: 'Cancelar solicitud de viaje' })}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelRequestBtnText}>{t('general.cancel', { defaultValue: 'Cancelar' })}</Text>
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
             // BUG-003: sincronizar paymentMethod al store ANTES de la solicitud
             useRideFlowStore.getState().setPaymentMethod(payment as 'CASH' | 'CARD' | 'APPLE_PAY' | 'WALLET');
             fareOfferSheetRef.current?.close();
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
          originAddress={pickupOverride?.address ?? pickupLocation?.displayName ?? 'Mi ubicación actual'}
          onEditOrigin={() => {
            fareOfferSheetRef.current?.close();
            setRouteEditorInitialField('origin');
            setTimeout(() => setRouteEditorVisible(true), 350);
          }}
          onEditDest={() => {
            fareOfferSheetRef.current?.close();
            setSelectedPlace(null);
            setTimeout(() => {
              setActiveMapField('destination');
              bottomSheetRef.current?.snapToIndex(2);
            }, 350);
          }}
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
      <RouteEditorSheet
        visible={routeEditorVisible}
        onClose={() => setRouteEditorVisible(false)}
        initialOriginAddress={pickupOverride?.address ?? pickupLocation?.displayName ?? 'Mi ubicación actual'}
        initialDestAddress={selectedPlace?.displayName}
        initialActiveField={routeEditorInitialField}
        userLat={location?.coords.latitude}
        userLng={location?.coords.longitude}
        onConfirm={({ origin, dest }) => {
          if (dest) {
            const destPlace = {
              displayName: dest.displayName,
              placeId: `route_${Date.now()}`,
              latitude: dest.latitude,
              longitude: dest.longitude,
            };
            setSelectedPlace(destPlace);
            saveToHistory(destPlace);
          }
          if (origin && origin.displayName !== 'Mi ubicación actual') {
            setPickupOverride({
              latitude: origin.latitude,
              longitude: origin.longitude,
              address: origin.displayName,
            });
          }
          setRouteEditorVisible(false);
          setTimeout(() => fareOfferSheetRef.current?.expand(), 400);
        }}
      />
    </View>
  );
}


// ─── Main styles ──────────────────────────────────────────────────────────────

const getStyles = (theme: Theme) => StyleSheet.create({
  searchProtagonist: {
    height: 60,
    borderRadius: 16,
    backgroundColor: theme.isDark ? '#2A1150' : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: theme.isDark ? 'rgba(245,197,24,0.55)' : '#EAE6F0',
    shadowColor: theme.isDark ? theme.colors.primary : '#000',
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
    backgroundColor: theme.isDark ? '#2A1150' : '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.isDark ? 'rgba(245,197,24,0.25)' : '#EAE6F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  historyItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyText: {
    flex: 1,
    fontSize: 15,
    color: theme.isDark ? theme.colors.text : '#0D0520',
    fontWeight: '500',
  },
  historyEmpty: {
    textAlign: 'center',
    fontSize: 13,
    color: theme.colors.textMuted,
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
