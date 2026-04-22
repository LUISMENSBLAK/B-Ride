import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, FlatList, ScrollView, Pressable, Keyboard,
} from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withRepeat, withSequence, withTiming, withSpring,
} from 'react-native-reanimated';
import { useRideFlowStore } from '../../store/useRideFlowStore';
import PaymentMethodSelector from '../../components/PaymentMethodSelector';
import { useCurrency } from '../../hooks/useCurrency'; // BUG-039: moneda dinámica


// ── Vehicle catalogue ───────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  {
    id: 'ECONOMY',
    name: 'Pop Ride',
    descriptor: 'Tu ride del día',
    category: 'ECONOMY',
    image: require('../../../assets/vehicles/pop_ride.png'),
  },
  {
    id: 'COMFORT', 
    name: 'Flow Ride',
    descriptor: 'Viaja con estilo',
    category: 'COMFORT',
    image: require('../../../assets/vehicles/flow_ride.png'),
  },
  {
    id: 'PREMIUM',
    name: 'Black Ride', 
    descriptor: 'Elegancia sin límites',
    category: 'PREMIUM',
    image: require('../../../assets/vehicles/black_ride.png'),
  },
  {
    id: 'XL',
    name: 'Big Ride',
    descriptor: 'Espacio para todos',
    category: 'GROUP',
    image: require('../../../assets/vehicles/big_ride.png'),
  },
];

// Map vehicle display name -> API category key
const CATEGORY_MAP: Record<string, string> = {
  'Pop Ride': 'ECONOMY',
  'Flow Ride': 'COMFORT',
  'Black Ride': 'PREMIUM',
  'Big Ride': 'GROUP',
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  APPLE_PAY: 'Apple Pay',
  WALLET: 'B-Ride Wallet',
};

const PAYMENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  CASH: 'cash-outline',
  CARD: 'card-outline',
  APPLE_PAY: 'logo-apple',
  WALLET: 'wallet-outline',
};

// ── Props ───────────────────────────────────────────────────────────────────
interface FareOfferSheetProps {
  onClose: () => void;
  onConfirm: (price: number, vehicleType: string, paymentMethod: string) => void;
  suggestedPriceRange?: { min: number; max: number };
  destAddress?: string;
  distanceKm?: number;
  estimatedTimeMin?: number;
  // GAP VISUAL 5: real prices from /rides/quote
  categoryOptions?: Record<string, { priceMXN?: number; etaMin?: number }> | null;
  loadingQuotes?: boolean;
  // Route editing
  originAddress?: string;
  onEditDest?: () => void;
  onEditOrigin?: () => void;
}

// ── VehicleCard (inner component) ───────────────────────────────────────────
const VehicleCard = React.memo(({
  item, isSelected, estimatedPrice, loadingPrice, onPress, formatPrice,
}: {
  item: typeof VEHICLE_TYPES[0];
  isSelected: boolean;
  estimatedPrice?: number;
  loadingPrice?: boolean;
  onPress: () => void;
  formatPrice: (n: number) => string; // BUG-039: moneda dinámica
}) => {
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
          // BUG-039: formatPrice en lugar de MX$ hardcodeado
          <Text style={styles.vehiclePrice}>{formatPrice(estimatedPrice)}</Text>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
  );
});

// ── Main component ──────────────────────────────────────────────────────────
export interface FareOfferSheetRef {
  expand: () => void;
  close: () => void;
}

const FareOfferSheet = forwardRef<FareOfferSheetRef, FareOfferSheetProps>((props, ref) => {
  const {
    onConfirm, onClose, suggestedPriceRange, destAddress, distanceKm, estimatedTimeMin,
    categoryOptions, loadingQuotes,
    originAddress, onEditDest, onEditOrigin,
  } = props;
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  // BUG-039: moneda dinámica
  const { formatPrice, currency } = useCurrency();
  const currencySymbol = currency === 'MXN' ? 'MX$' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;

  // ── State ──
  const [priceStr, setPriceStr] = useState('');
  const [vehicleType, setVehicleType] = useState('ECONOMY');
  const paymentMethod = useRideFlowStore(s => s.paymentMethod);
  const setPaymentMethod = useRideFlowStore(s => s.setPaymentMethod);

  useEffect(() => {
    if (!categoryOptions) return;
    const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
    const category = selectedVehicle?.category ?? 'ECONOMY';
    const opt = categoryOptions[category];
    if (opt?.priceMXN && opt.priceMXN > 0) {
      setPriceStr(Math.round(opt.priceMXN).toString());
    }
  }, [vehicleType, categoryOptions]);

  // BUG 2: payment picker state
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  // ── Cursor parpadeante ──
  const cursorOpacity = useSharedValue(1);
  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 600 }),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      true,
    );
  }, []);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorOpacity.value }));

  // ── CTA spring al habilitarse ──
  const ctaScale = useSharedValue(1);
  const currentPrice = parseFloat(priceStr || '0');
  const selectedVehicleCat = VEHICLE_TYPES.find(v => v.id === vehicleType)?.category ?? 'ECONOMY';
  const minPrice = (categoryOptions?.[selectedVehicleCat] as any)?.minFareMXN ?? (categoryOptions?.[selectedVehicleCat] as any)?.minFare ?? 45;
  const isUnderMin = currentPrice > 0 && currentPrice < minPrice;
  const isValid = currentPrice >= minPrice && !loadingQuotes;
  useEffect(() => {
    if (isValid) {
      ctaScale.value = withSequence(
        withSpring(0.97, { damping: 12 }),
        withSpring(1, { damping: 12 }),
      );
    }
  }, [isValid]);
  const ctaAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  useImperativeHandle(ref, () => ({
    expand: () => {
      // BUG-039 FIX: Primero abrir el sheet, luego resetear estado en el siguiente frame
      Keyboard.dismiss();
      sheetRef.current?.snapToIndex(0); // Usar snapToIndex(0) para asegurar la apertura
      requestAnimationFrame(() => {
        setPriceStr('');
        setVehicleType('ECONOMY');
        setShowPaymentPicker(false);
      });
    },
    close: () => {
      sheetRef.current?.close();
    }
  }));

  // ── Numpad handler ──
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

  // Compute estimated price per vehicle from API or fallback formula
  const getEstimatedPrice = (item: typeof VEHICLE_TYPES[0]): number | undefined => {
    const apiPrice = categoryOptions?.[item.category]?.priceMXN;
    if (apiPrice !== undefined) return Math.round(apiPrice);
    // fallback formula (uses suggestedPriceRange mid-point + multiplier)
    if (suggestedPriceRange) {
      const mid = (suggestedPriceRange.min + suggestedPriceRange.max) / 2;
      const mult = (item.category === 'PREMIUM' || item.category === 'GROUP') ? 1.4
        : item.category === 'COMFORT' ? 1.2 : 1.0;
      return Math.round(mid * mult);
    }
    return undefined;
  };

  const snapPoints = useMemo(() => ['92%'], []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}  // BUG-039: onClose para deslizar hacia abajo
      backgroundStyle={s.sheetBg}
      style={{ zIndex: 9999, elevation: 10 }}
      // GAP VISUAL 4: custom handle bar instead of null
      handleComponent={() => (
        <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        </View>
      )}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── SECCIÓN 1: Header ── */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Ofrece tu precio</Text>
            {destAddress && (
              <Text style={s.headerSub} numberOfLines={1}>
                {'→ '}{destAddress}
              </Text>
            )}
            {distanceKm !== undefined && estimatedTimeMin !== undefined && distanceKm > 0 && (
              <Text style={s.headerMeta}>{distanceKm} km · ~{estimatedTimeMin} min</Text>
            )}
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Ionicons name="close" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* ── ROUTE SUMMARY BAR ── */}
        <View style={{
          marginHorizontal: 16,
          marginTop: 12,
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          padding: 12,
        }}>
          {/* Fila origen */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 10, height: 10, borderRadius: 5,
              backgroundColor: '#3D8EF0',
              borderWidth: 2, borderColor: 'rgba(61,142,240,0.4)',
            }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10,
                textTransform: 'uppercase', letterSpacing: 1 }}>Recogida</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 1 }}
                numberOfLines={1}>{originAddress ?? 'Mi ubicación actual'}</Text>
            </View>
            {onEditOrigin && (
              <TouchableOpacity
                onPress={onEditOrigin}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6,
                  backgroundColor: 'rgba(61,142,240,0.10)',
                  borderRadius: 8, borderWidth: 1,
                  borderColor: 'rgba(61,142,240,0.25)',
                }}>
                <Text style={{ 
                  color: '#3D8EF0', fontSize: 11, fontWeight: '700' 
                }}>Cambiar</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Conector */}
          <View style={{
            width: 1, height: 16,
            backgroundColor: 'rgba(255,255,255,0.10)',
            marginLeft: 4, marginVertical: 4,
          }} />

          {/* Fila destino */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 10, height: 10, borderRadius: 2,
              backgroundColor: '#F5C518',
            }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.40)', fontSize: 10,
                textTransform: 'uppercase', letterSpacing: 1 }}>Destino</Text>
              <Text style={{ color: '#F5C518', fontSize: 13, fontWeight: '600', marginTop: 1 }}
                numberOfLines={1}>{destAddress ?? 'Sin destino'}</Text>
            </View>
            {onEditDest && (
              <TouchableOpacity
                onPress={onEditDest}
                style={{
                  paddingHorizontal: 10, paddingVertical: 6,
                  backgroundColor: 'rgba(245,197,24,0.10)',
                  borderRadius: 8, borderWidth: 1,
                  borderColor: 'rgba(245,197,24,0.25)',
                }}>
                <Text style={{ color: '#F5C518', fontSize: 11, fontWeight: '700' }}>Cambiar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── SECCIÓN 2: Hero Price Input ── */}
        <View style={s.heroContainer}>
          <View style={s.priceRow}>
            <Text style={s.currencyPrefix}>{currencySymbol}</Text>
            <Text style={s.priceNumber}>{priceStr || ''}</Text>
            {priceStr.length === 0 || priceStr.length < 4 ? (
              <Animated.View style={[s.cursor, cursorStyle]} />
            ) : null}
          </View>
          <View style={s.priceDivider} />
          <Text style={s.priceSuggLabel}>Precio sugerido: {formatPrice(suggestedPriceRange?.min ?? 0)} – {formatPrice(suggestedPriceRange?.max ?? 0)}</Text>
          {isUnderMin && (
            <Text style={{ color: '#FF5722', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              Mínimo MX${minPrice} — sube la oferta para atraer conductores
            </Text>
          )}
        </View>

        {/* ── SECCIÓN 3: Tipo de vehículo ── */}
        <Text style={s.vehicleSectionLabel}>Elige tu ride</Text>
        <View style={{ position: 'relative', marginBottom: 4 }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={VEHICLE_TYPES}
            keyExtractor={item => item.id}
            contentContainerStyle={s.vehicleListContent}
            renderItem={({ item }) => (
              <VehicleCard
                item={item}
                isSelected={vehicleType === item.id}
                estimatedPrice={loadingQuotes ? undefined : getEstimatedPrice(item)}
                loadingPrice={loadingQuotes}
                onPress={() => setVehicleType(item.id)}
                formatPrice={formatPrice}  // BUG-039: pasar formatPrice como prop
              />
            )}
          />
          <LinearGradient
            colors={['rgba(13,5,32,0)', 'rgba(13,5,32,0.95)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={s.vehicleFade}
            pointerEvents="none"
          />
        </View>

        {/* ── SECCIÓN 4: Pago (BUG 2 fix — onPress + picker inline) ── */}
        <TouchableOpacity
          style={s.paymentRow}
          activeOpacity={0.75}
          onPress={() => setShowPaymentPicker(v => !v)}
        >
          <Ionicons name={paymentIcon} size={20} color="rgba(255,255,255,0.75)" />
          <Text style={s.paymentLabel}>{paymentLabel}</Text>
          <Ionicons
            name={showPaymentPicker ? 'chevron-up' : 'chevron-forward'}
            size={16}
            color="rgba(255,255,255,0.40)"
          />
        </TouchableOpacity>

        {showPaymentPicker && (
          <View style={s.paymentOptions}>
            {(['CASH', 'CARD', 'APPLE_PAY', 'WALLET'] as const).map(method => (
              <TouchableOpacity
                key={method}
                style={[s.paymentOption, paymentMethod === method && s.paymentOptionActive]}
                onPress={() => {
                  useRideFlowStore.getState().setPaymentMethod(method);
                  setShowPaymentPicker(false);
                }}
              >
                <Ionicons
                  name={PAYMENT_ICONS[method]}
                  size={18}
                  color={paymentMethod === method ? '#F5C518' : 'rgba(255,255,255,0.6)'}
                />
                <Text style={[s.paymentOptionText, paymentMethod === method && s.paymentOptionTextActive]}>
                  {PAYMENT_LABELS[method]}
                </Text>
                {paymentMethod === method && <Ionicons name="checkmark" size={16} color="#F5C518" />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── NUMPAD CUSTOM ── */}
        <View style={s.numpadContainer}>
          {numpadKeys.map(key => (
            <Pressable
              key={key}
              style={({ pressed }) => [
                s.numpadKey,
                pressed && s.numpadKeyPressed
              ]}
              onPress={() => handleKeyPress(key)}
            >
              {key === 'back'
                ? <Ionicons name="backspace-outline" size={26} color="#FFF" />
                : <Text style={s.numpadKeyText}>{key}</Text>
              }
            </Pressable>
          ))}
        </View>

        {/* ── SECCIÓN 5: CTA ── */}
        <Animated.View style={[ctaAnimStyle, { paddingBottom: insets.bottom }]}>
          <TouchableOpacity
            style={[s.ctaBtn, isValid ? s.ctaEnabled : s.ctaDisabled]}
            disabled={!isValid}
            onPress={() => {
              // BUG 1 fix: pass .category (e.g. 'ECONOMY') not the display name
              const selectedVehicle = VEHICLE_TYPES.find(v => v.id === vehicleType);
              onConfirm(currentPrice, selectedVehicle?.category ?? 'ECONOMY', paymentMethod);
              onClose();
            }}
            activeOpacity={0.88}
          >
            <Text style={[s.ctaText, isValid ? s.ctaTextEnabled : s.ctaTextDisabled]}>
              {/* BUG-039: formatPrice en lugar de MX$ hardcodeado */}
              {isValid ? `Solicitar · ${formatPrice(currentPrice)}` : `Mínimo ${formatPrice(minPrice)}`}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </BottomSheet>
  );
});

export default FareOfferSheet;
// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sheetBg: { backgroundColor: 'rgba(13,5,32,0.97)', borderTopLeftRadius: 28, borderTopRightRadius: 28 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 13,
    color: '#F5C518',
    marginTop: 4,
  },
  headerMeta: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    marginTop: 4,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 12,
    marginTop: 2,
  },

  // Hero price
  heroContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.35)',
    marginRight: 6,
    marginBottom: 12,
  },
  priceNumber: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  cursor: {
    width: 3,
    height: 60,
    backgroundColor: '#F5C518',
    borderRadius: 2,
    marginLeft: 4,
    alignSelf: 'center',
  },
  priceDivider: {
    height: 2,
    backgroundColor: 'rgba(245,197,24,0.35)',
    marginHorizontal: 40,
    marginTop: 8,
    alignSelf: 'stretch',
  },
  priceSuggLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.30)',
    textAlign: 'center',
    marginTop: 8,
  },

  // Vehicle section
  vehicleSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginLeft: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  vehicleListContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  vehicleFade: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 20,
  },

  // Vehicle card
  vehicleCard: {
    width: 110,
    height: 155,
    borderRadius: 16,
    padding: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  vehicleCardSelected: {
    backgroundColor: 'rgba(245,197,24,0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.60)',
  },
  vehicleCheck: {
    position: 'absolute',
    top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#F5C518',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 2,
  },
  vehicleImage: {
    width: '100%',
    height: 65,
    resizeMode: 'contain',
  },
  vehicleName: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  vehicleNameSel: {
    color: '#F5C518',
  },
  vehicleNameUnsel: {
    color: '#FFFFFF',
  },
  vehicleDescriptor: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  vehiclePrice: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.80)',
    fontWeight: '600',
  },

  // Payment row
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  paymentLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  // Inline payment picker
  paymentOptions: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  paymentOptionActive: {
    backgroundColor: 'rgba(245,197,24,0.10)',
  },
  paymentOptionText: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 14,
    flex: 1,
  },
  paymentOptionTextActive: {
    color: '#F5C518',
  },

  // Numpad Custom
  numpadContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 8,
    rowGap: 4,
  },
  numpadKey: {
    width: '32%',
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10,
  },
  numpadKeyPressed: {
    backgroundColor: 'rgba(245,197,24,0.12)',
  },
  numpadKeyText: {
    fontSize: 26,
    fontWeight: '300',
    color: '#FFFFFF',
  },

  // CTA
  ctaBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 0,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaEnabled: {
    backgroundColor: '#F5C518',
    shadowColor: '#F5C518',
    shadowOpacity: 0.40,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  ctaDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ctaText: {
    fontSize: 17,
  },
  ctaTextEnabled: {
    color: '#0D0520',
    fontWeight: '800',
  },
  ctaTextDisabled: {
    color: 'rgba(255,255,255,0.25)',
    fontWeight: '600',
  },
});

// Keep legacy alias so old imports compile cleanly
const styles = s;
