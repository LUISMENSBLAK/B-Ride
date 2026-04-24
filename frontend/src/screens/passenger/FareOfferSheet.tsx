import React, {
  useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback,
} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Image, FlatList, ScrollView, Pressable, Keyboard,
  Animated as RNAnimated, Easing, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { useRideFlowStore } from '../../store/useRideFlowStore';
import { useCurrency } from '../../hooks/useCurrency'; // BUG-039: moneda dinámica


// V2-006: SCREEN_HEIGHT se mueve dentro del componente como state dinámico
const { height: INITIAL_SCREEN_HEIGHT } = Dimensions.get('window');

// ── Vehicle catalogue ────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  { id: 'ECONOMY',  name: 'Pop Ride',   descriptor: 'Tu ride del día',        category: 'ECONOMY',  image: require('../../../assets/vehicles/pop_ride.png') },
  { id: 'COMFORT',  name: 'Flow Ride',  descriptor: 'Viaja con estilo',        category: 'COMFORT',  image: require('../../../assets/vehicles/flow_ride.png') },
  { id: 'PREMIUM',  name: 'Black Ride', descriptor: 'Elegancia sin límites',   category: 'PREMIUM',  image: require('../../../assets/vehicles/black_ride.png') },
  { id: 'XL',       name: 'Big Ride',   descriptor: 'Espacio para todos',      category: 'GROUP',    image: require('../../../assets/vehicles/big_ride.png') },
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo', CARD: 'Tarjeta', APPLE_PAY: 'Apple Pay', WALLET: 'B-Ride Wallet',
};
const PAYMENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  CASH: 'cash-outline', CARD: 'card-outline', APPLE_PAY: 'logo-apple', WALLET: 'wallet-outline',
};

// ── Props ────────────────────────────────────────────────────────────────────
interface FareOfferSheetProps {
  onClose: () => void;
  onConfirm: (price: number, vehicleType: string, paymentMethod: string) => void;
  suggestedPriceRange?: { min: number; max: number };
  destAddress?: string;
  distanceKm?: number;
  estimatedTimeMin?: number;
  categoryOptions?: Record<string, { priceMXN?: number; etaMin?: number }> | null;
  loadingQuotes?: boolean;
  originAddress?: string;
  onEditDest?: () => void;
  onEditOrigin?: () => void;
}

export interface FareOfferSheetRef {
  expand: () => void;
  close: () => void;
}

// ── VehicleCard ──────────────────────────────────────────────────────────────
const VehicleCard = React.memo(({
  item, isSelected, estimatedPrice, loadingPrice, onPress, formatPrice,
}: {
  item: typeof VEHICLE_TYPES[0];
  isSelected: boolean;
  estimatedPrice?: number;
  loadingPrice?: boolean;
  onPress: () => void;
  formatPrice: (n: number) => string;
}) => {
  // V2-018: animación táctil con spring
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={() => { scale.value = withSpring(0.96, { damping: 20, stiffness: 400 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 20, stiffness: 400 }); }}
      onPress={onPress}
    >
      <Animated.View style={[
        styles.vehicleCard,
        isSelected && styles.vehicleCardSelected,
        cardStyle,
      ]}>
        {isSelected && (
          <View style={styles.vehicleCheck}>
            <Ionicons name="checkmark" size={12} color="#0D0520" />
          </View>
        )}
        <Image source={item.image} style={styles.vehicleImage} resizeMode="contain" />
        <Text style={[styles.vehicleName, isSelected ? styles.vehicleNameSel : styles.vehicleNameUnsel]}>
          {item.name}
        </Text>
        <Text style={styles.vehicleDescriptor}>{item.descriptor}</Text>
        {loadingPrice ? (
          <Text style={styles.vehiclePrice}>···</Text>
        ) : estimatedPrice !== undefined ? (
          <Text style={styles.vehiclePrice}>{formatPrice(estimatedPrice)}</Text>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
  );
});

// ── Main component ───────────────────────────────────────────────────────────
const FareOfferSheet = forwardRef<FareOfferSheetRef, FareOfferSheetProps>((props, ref) => {
  const {
    onConfirm, onClose, suggestedPriceRange, destAddress, distanceKm, estimatedTimeMin,
    categoryOptions, loadingQuotes, originAddress, onEditDest, onEditOrigin,
  } = props;

  const insets = useSafeAreaInsets();
  const { formatPrice, currency } = useCurrency();
  const currencySymbol = currency === 'MXN' ? 'MX$' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;

  // ── Visibility state ──
  const [visible, setVisible] = useState(false);
  // V2-006: screenHeight dinámico para rotación/resize
  const [screenHeight, setScreenHeight] = useState(INITIAL_SCREEN_HEIGHT);
  const slideAnim = useRef(new RNAnimated.Value(INITIAL_SCREEN_HEIGHT)).current;
  // V2-010: guard contra doble cierre
  const isClosingRef = useRef(false);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreenHeight(window.height);
    });
    return () => sub?.remove();
  }, []);

  const openSheet = () => {
    isClosingRef.current = false; // V2-010: reset al abrir
    setVisible(true);
    RNAnimated.timing(slideAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeSheet = () => {
    if (isClosingRef.current) return; // V2-010: evitar doble cierre
    isClosingRef.current = true;
    RNAnimated.timing(slideAnim, {
      toValue: screenHeight, // V2-006: usar altura dinámica
      duration: 280,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false; // V2-010: reset al terminar
      setVisible(false);
      onClose();
    });
  };

  // ── State ──
  const [priceStr, setPriceStr] = useState('');
  const [vehicleType, setVehicleType] = useState('ECONOMY');
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [numpadVisible, setNumpadVisible] = useState(false); // BUG-009: numpad oculto por defecto
  const scrollViewRef = useRef<ScrollView>(null);
  const paymentMethod = useRideFlowStore(s => s.paymentMethod);

  const categoryOptionsRef = useRef<typeof categoryOptions | null>(null);
  useEffect(() => { categoryOptionsRef.current = categoryOptions; }, [categoryOptions]);

  // Auto-update price when vehicle or options change
  useEffect(() => {
    if (!categoryOptions) return;
    const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
    const category = selectedVehicle?.category ?? 'ECONOMY';
    const opt = categoryOptions[category];
    if (opt?.priceMXN && opt.priceMXN > 0) {
      setPriceStr(Math.round(opt.priceMXN).toString());
    }
  }, [vehicleType, categoryOptions]);

  // ── Ref API ──
  useImperativeHandle(ref, () => ({
    expand: () => {
      Keyboard.dismiss();
      // Pre-load price from current options
      const opts = categoryOptionsRef.current;
      if (opts?.['ECONOMY']?.priceMXN && opts['ECONOMY'].priceMXN! > 0) {
        setPriceStr(Math.round(opts['ECONOMY'].priceMXN!).toString());
      } else {
        setPriceStr('');
      }
      setVehicleType('ECONOMY');
      setShowPaymentPicker(false);
      setNumpadVisible(false); // BUG-009: nunca abrir con numpad visible
      openSheet();
    },
    close: () => closeSheet(),
  }));

  // ── Price validation ──
  const currentPrice = parseFloat(priceStr || '0');
  const selectedVehicleCat = VEHICLE_TYPES.find(v => v.id === vehicleType)?.category ?? 'ECONOMY';
  const minPrice = (categoryOptions?.[selectedVehicleCat] as any)?.minFareMXN
    ?? (categoryOptions?.[selectedVehicleCat] as any)?.minFare ?? 45;
  const isUnderMin = currentPrice > 0 && currentPrice < minPrice;
  const isValid = currentPrice >= minPrice && !loadingQuotes;

  // ── Cursor animation (Reanimated) ──
  const cursorOpacity = useSharedValue(1);
  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ), -1, true,
    );
  }, []);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  // V2-025: shake animation para pill cuando precio inválido
  const pillShakeX = useSharedValue(0);
  const pillShakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pillShakeX.value }] }));

  // ── Numpad ──
  const handleKeyPress = (val: string) => {
    if (val === 'back') { setPriceStr(p => p.slice(0, -1)); return; }
    if (val === '.') {
      if (priceStr.includes('.')) return;
      setPriceStr(p => (p.length === 0 ? '0.' : p + '.'));
      return;
    }
    const parts = priceStr.split('.');
    if (parts.length === 2 && parts[1].length >= 2) return;
    if (parts[0].length >= 4 && !priceStr.includes('.')) return;
    setPriceStr(p => (p === '0' && val !== '.' ? val : p + val));
  };
  const numpadKeys = ['1','2','3','4','5','6','7','8','9','.','0','back'];

  const paymentLabel = PAYMENT_LABELS[paymentMethod] ?? 'Efectivo';
  const paymentIcon  = PAYMENT_ICONS[paymentMethod]  ?? 'cash-outline';

  const getEstimatedPrice = (item: typeof VEHICLE_TYPES[0]): number | undefined => {
    const apiPrice = categoryOptions?.[item.category]?.priceMXN;
    if (apiPrice !== undefined) return Math.round(apiPrice);
    if (suggestedPriceRange) {
      const mid = (suggestedPriceRange.min + suggestedPriceRange.max) / 2;
      const mult = (item.category === 'PREMIUM' || item.category === 'GROUP') ? 1.4
        : item.category === 'COMFORT' ? 1.2 : 1.0;
      return Math.round(mid * mult);
    }
    return undefined;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={closeSheet}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={closeSheet}
      />
      {/* Sheet */}
      <RNAnimated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle — decorativo, sin interáccion */}
        <View style={styles.handle} accessible={false} importantForAccessibility="no-hide-descendants">
          <View style={styles.handleBar} />
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Ofrece tu precio</Text>
              {destAddress && (
                <Text style={styles.headerSub} numberOfLines={1}>{'→ '}{destAddress}</Text>
              )}
              {distanceKm !== undefined && estimatedTimeMin !== undefined && distanceKm > 0 && (
                <Text style={styles.headerMeta}>{distanceKm} km · ~{estimatedTimeMin} min</Text>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={closeSheet} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
              <Ionicons name="close" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* ── Route summary ── */}
          <View style={styles.routeCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3D8EF0', borderWidth: 2, borderColor: 'rgba(61,142,240,0.4)' }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>Recogida</Text>
                <Text style={styles.routeText} numberOfLines={1}>{originAddress ?? 'Mi ubicación actual'}</Text>
              </View>
              {onEditOrigin && (
                <TouchableOpacity onPress={onEditOrigin} style={styles.routeEditBtn}>
                  <Text style={styles.routeEditTextBlue}>Cambiar</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.routeConnector} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#F5C518' }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>Destino</Text>
                <Text style={[styles.routeText, { color: '#F5C518' }]} numberOfLines={1}>{destAddress ?? 'Sin destino'}</Text>
              </View>
              {onEditDest && (
                <TouchableOpacity onPress={onEditDest} style={[styles.routeEditBtn, { backgroundColor: 'rgba(245,197,24,0.10)', borderColor: 'rgba(245,197,24,0.25)' }]}>
                  <Text style={[styles.routeEditTextBlue, { color: '#F5C518' }]}>Cambiar</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── HERO PRICE: pill táctil + quick-adjust buttons ── */}
          {(() => {
            const suggestedMid = categoryOptions?.[selectedVehicleCat]?.priceMXN
              ?? ((suggestedPriceRange?.min ?? 0) + (suggestedPriceRange?.max ?? 0)) / 2;
            const quickOptions = [
              { label: '-20%', value: Math.max(minPrice, Math.round(suggestedMid * 0.80)) },
              { label: 'Sugerido', value: Math.round(suggestedMid) },
              { label: '+10%', value: Math.round(suggestedMid * 1.10) },
            ];
            return (
              <View style={styles.heroContainer}>
                {/* Pill — V2-025: envuelta en Animated.View para el shake */}
                <Animated.View style={pillShakeStyle}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setNumpadVisible(true);
                      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                    }}
                    style={[
                      styles.pricePill,
                      numpadVisible && styles.pricePillActive,
                    ]}
                  >
                    <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                    <Text style={[styles.priceNumber, {
                      fontSize: priceStr.length >= 4 ? 46 : 56,
                      color: priceStr.length > 0 ? '#F5C518' : 'rgba(255,255,255,0.30)',
                    }]}>
                      {priceStr || '0'}
                    </Text>
                    {numpadVisible && (
                      <Animated.View style={[styles.cursor, cursorStyle]} />
                    )}
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={numpadVisible ? 'rgba(245,197,24,0.80)' : 'rgba(245,197,24,0.45)'}
                      style={{ marginLeft: 8 }}
                    />
                  </TouchableOpacity>
                </Animated.View>

                {/* Quick-adjust buttons */}
                <View style={styles.quickRow}>
                  {quickOptions.map(opt => {
                    const active = currentPrice === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        style={[styles.quickBtn, active && styles.quickBtnActive]}
                        onPress={() => { setPriceStr(String(opt.value)); setNumpadVisible(false); }}
                        activeOpacity={0.75}
                        accessibilityLabel={`${opt.label}: ${formatPrice(opt.value)}`}
                        accessibilityRole="button"
                        accessibilityHint={`Toca para fijar el precio en ${formatPrice(opt.value)}`}
                      >
                        <Text style={[styles.quickBtnText, active && styles.quickBtnTextActive]}>
                          {opt.label === 'Sugerido' ? `${opt.label} ✓` : opt.label}
                        </Text>
                        <Text style={[styles.quickBtnSub, active && { color: '#F5C518' }]}>
                          {formatPrice(opt.value)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Sugg range label */}
                <Text style={styles.priceSuggLabel}>
                  Precio sugerido: {formatPrice(suggestedPriceRange?.min ?? 0)} – {formatPrice(suggestedPriceRange?.max ?? 0)}
                </Text>
                {isUnderMin && (
                  <Text style={{ color: '#FF5722', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    Mínimo {formatPrice(minPrice)} — sube la oferta
                  </Text>
                )}
              </View>
            );
          })()}

          {/* ── Vehicle selector ── */}
          <Text style={styles.vehicleSectionLabel}>Elige tu ride</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={VEHICLE_TYPES}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.vehicleListContent}
            renderItem={({ item }) => (
              <VehicleCard
                item={item}
                isSelected={vehicleType === item.id}
                estimatedPrice={loadingQuotes ? undefined : getEstimatedPrice(item)}
                loadingPrice={loadingQuotes}
                onPress={() => setVehicleType(item.id)}
                formatPrice={formatPrice}
              />
            )}
          />

          {/* ── Payment ── */}
          <TouchableOpacity
            style={styles.paymentRow}
            activeOpacity={0.75}
            onPress={() => setShowPaymentPicker(v => !v)}
          >
            <Ionicons name={paymentIcon} size={20} color="rgba(255,255,255,0.75)" />
            <Text style={styles.paymentLabel}>{paymentLabel}</Text>
            <Ionicons name={showPaymentPicker ? 'chevron-up' : 'chevron-forward'} size={16} color="rgba(255,255,255,0.40)" />
          </TouchableOpacity>

          {showPaymentPicker && (
            <View style={styles.paymentOptions}>
              {(['CASH', 'CARD', 'APPLE_PAY', 'WALLET'] as const).map(method => (
                <TouchableOpacity
                  key={method}
                  style={[styles.paymentOption, paymentMethod === method && styles.paymentOptionActive]}
                  onPress={() => {
                    useRideFlowStore.getState().setPaymentMethod(method);
                    setShowPaymentPicker(false);
                  }}
                >
                  <Ionicons name={PAYMENT_ICONS[method]} size={18} color={paymentMethod === method ? '#F5C518' : 'rgba(255,255,255,0.6)'} />
                  <Text style={[styles.paymentOptionText, paymentMethod === method && styles.paymentOptionTextActive]}>
                    {PAYMENT_LABELS[method]}
                  </Text>
                  {paymentMethod === method && <Ionicons name="checkmark" size={16} color="#F5C518" />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Numpad (solo cuando numpadVisible) ── */}
          {numpadVisible && (
            <View>
              {/* Separador + header del numpad */}
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16, marginTop: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 10, marginBottom: 4 }}>
                <Text style={{ flex: 1, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
                  Ingresa tu oferta
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (isUnderMin) {
                      // V2-025: shake la pill si el precio es inválido
                      pillShakeX.value = withSequence(
                        withTiming(-8, { duration: 60 }),
                        withTiming(8, { duration: 60 }),
                        withTiming(-6, { duration: 50 }),
                        withTiming(6, { duration: 50 }),
                        withTiming(0, { duration: 40 }),
                      );
                    } else {
                      setNumpadVisible(false);
                    }
                  }}
                  hitSlop={{ top:8,bottom:8,left:8,right:8 }}
                >
                  <Text style={{ color: '#F5C518', fontSize: 14, fontWeight: '700' }}>Listo</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.numpadContainer}>
                {numpadKeys.map(key => (
                  <Pressable
                    key={key}
                    style={({ pressed }) => [styles.numpadKey, pressed && styles.numpadKeyPressed]}
                    onPress={() => handleKeyPress(key)}
                  >
                    {key === 'back'
                      ? <Ionicons name="backspace-outline" size={26} color="#FFF" />
                      : <Text style={styles.numpadKeyText}>{key}</Text>
                    }
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[styles.ctaBtn, isValid ? styles.ctaEnabled : styles.ctaDisabled]}
            disabled={!isValid}
            onPress={() => {
              const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
              onConfirm(currentPrice, selectedVehicle?.category ?? 'ECONOMY', paymentMethod);
              closeSheet();
            }}
            activeOpacity={0.88}
          >
            <Text style={[styles.ctaText, isValid ? styles.ctaTextEnabled : styles.ctaTextDisabled]}>
              {isValid ? `Solicitar · ${formatPrice(currentPrice)}` : `Mínimo ${formatPrice(minPrice)}`}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </RNAnimated.View>
    </Modal>
  );
});

export default FareOfferSheet;

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '93%',
    backgroundColor: '#0E0525',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderColor: 'rgba(245,197,24,0.20)',
    shadowColor: '#F5C518',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  handle: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(245,197,24,0.35)' },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, paddingHorizontal: 20, marginBottom: 0 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: '#F5C518', marginTop: 3, fontWeight: '500' },
  headerMeta: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3, fontWeight: '400' },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 12, marginTop: 4,
  },

  // Route card
  routeCard: {
    marginHorizontal: 16, marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 14,
  },
  routeLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700' },
  routeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 2 },
  routeConnector: { width: 1.5, height: 14, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 4, marginVertical: 6 },
  routeEditBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(61,142,240,0.12)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(61,142,240,0.20)' },
  routeEditTextBlue: { color: '#5BA3F5', fontSize: 11, fontWeight: '700' },

  // Hero price — pill + quick-adjust
  heroContainer: { alignItems: 'center', marginTop: 16, marginBottom: 4, paddingHorizontal: 16 },
  pricePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,197,24,0.25)',
    borderRadius: 24, paddingHorizontal: 28, paddingVertical: 16,
    marginBottom: 14,
  },
  pricePillActive: {
    borderColor: 'rgba(245,197,24,0.70)',
    shadowColor: '#F5C518', shadowOpacity: 0.30, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
    elevation: 8, // V2-026: Android shadow
  },
  currencyPrefix: { fontSize: 20, fontWeight: '300', color: 'rgba(255,255,255,0.45)', marginRight: 4 },
  priceNumber: { fontSize: 56, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1.5 },
  cursor: { width: 3, height: 44, backgroundColor: '#F5C518', borderRadius: 2, marginLeft: 6, alignSelf: 'center', shadowColor: '#F5C518', shadowOpacity: 0.80, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 10, justifyContent: 'center' },
  quickBtn: {
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
  },
  quickBtnActive: { backgroundColor: 'rgba(245,197,24,0.18)', borderColor: 'rgba(245,197,24,0.60)' },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  quickBtnTextActive: { color: '#F5C518' },
  quickBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1, fontWeight: '600' },
  priceSuggLabel: { fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 2, fontWeight: '500' },
  // V2-024: priceRow/priceDivider eliminados (eran aliases vacíos sin uso)

  // Vehicle
  vehicleSectionLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.40)', letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 20, marginTop: 18, marginBottom: 10 },
  vehicleListContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  vehicleCard: {
    width: 115, height: 160, borderRadius: 18, padding: 12,
    overflow: 'hidden', backgroundColor: '#160B38',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.07)',
  },
  vehicleCardSelected: {
    backgroundColor: '#1D0D44',
    borderColor: '#F5C518',
    shadowColor: '#F5C518',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6, // V2-026: Android shadow
  },
  vehicleCheck: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: '#F5C518', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  vehicleImage: { width: '100%', height: 68, resizeMode: 'contain' },
  vehicleName: { fontSize: 12, fontWeight: '800', marginTop: 8, letterSpacing: -0.3 },
  vehicleNameSel: { color: '#F5C518' },
  vehicleNameUnsel: { color: '#FFFFFF' },
  vehicleDescriptor: { fontSize: 9.5, color: 'rgba(255,255,255,0.40)', marginTop: 2, fontWeight: '500' },
  vehiclePrice: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 4 },

  // Payment
  paymentRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, marginHorizontal: 16,
    paddingVertical: 14, paddingHorizontal: 16,
    backgroundColor: '#160B38',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderLeftWidth: 3, borderLeftColor: 'rgba(245,197,24,0.40)',
  },
  paymentLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginLeft: 12 },
  paymentOptions: { marginHorizontal: 16, marginTop: 4, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', backgroundColor: '#160B38' },
  paymentOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  paymentOptionActive: { backgroundColor: 'rgba(245,197,24,0.08)' },
  paymentOptionText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, flex: 1, fontWeight: '500' },
  paymentOptionTextActive: { color: '#F5C518', fontWeight: '700' },

  // Numpad
  numpadContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  numpadKey: {
    width: '33.33%', height: 58,
    justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  numpadKeyPressed: { backgroundColor: 'rgba(245,197,24,0.10)' },
  numpadKeyText: { fontSize: 28, fontWeight: '300', color: '#FFFFFF', letterSpacing: -0.5 },

  // CTA
  ctaBtn: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaEnabled: {
    backgroundColor: '#F5C518',
    shadowColor: '#F5C518',
    shadowOpacity: 0.50,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  ctaDisabled: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ctaText: { fontSize: 17, letterSpacing: -0.3 },
  ctaTextEnabled: { color: '#0D0520', fontWeight: '900' },
  ctaTextDisabled: { color: 'rgba(255,255,255,0.20)', fontWeight: '600' },
});

// Keep legacy alias
const s = styles;
