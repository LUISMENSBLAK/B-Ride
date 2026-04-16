import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, FlatList, ScrollView, Pressable,
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

// ── Vehicle catalogue ───────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  {
    id: 'Pop Ride',
    name: 'Pop Ride',
    category: 'ECONOMY',
    image: require('../../../assets/vehicles/pop_ride.png'),
  },
  {
    id: 'Flow Ride',
    name: 'Flow Ride',
    category: 'COMFORT',
    image: require('../../../assets/vehicles/flow_ride.png'),
  },
  {
    id: 'Black Ride',
    name: 'Black Ride',
    category: 'PREMIUM',
    image: require('../../../assets/vehicles/black_ride.png'),
  },
  {
    id: 'Big Ride',
    name: 'Big Ride',
    category: 'XL',
    image: require('../../../assets/vehicles/big_ride.png'),
  },
];

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
  visible: boolean;
  onClose: () => void;
  onConfirm: (price: number, vehicleType: string, paymentMethod: string) => void;
  suggestedPriceRange?: { min: number; max: number };
  destAddress?: string;
  distanceKm?: number;
  estimatedTimeMin?: number;
}

// ── VehicleCard (inner component) ───────────────────────────────────────────
const VehicleCard = React.memo(({
  item, isSelected, estimatedPrice, onPress,
}: {
  item: typeof VEHICLE_TYPES[0];
  isSelected: boolean;
  estimatedPrice?: number;
  onPress: () => void;
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
        {estimatedPrice !== undefined && (
          <Text style={styles.vehiclePrice}>MX${estimatedPrice}</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
});

// ── Main component ──────────────────────────────────────────────────────────
export default function FareOfferSheet({
  visible, onClose, onConfirm, suggestedPriceRange, destAddress, distanceKm, estimatedTimeMin
}: FareOfferSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);

  // ── State (lógica intacta) ──
  const [priceStr, setPriceStr] = useState('');
  const [vehicleType, setVehicleType] = useState('Pop Ride');
  const paymentMethod = useRideFlowStore(s => s.paymentMethod);

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
  const isValid = currentPrice > 0;
  useEffect(() => {
    if (isValid) {
      ctaScale.value = withSequence(
        withSpring(0.97, { damping: 12 }),
        withSpring(1, { damping: 12 }),
      );
    }
  }, [isValid]);
  const ctaAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  // ── Sheet open/close ──
  useEffect(() => {
    if (visible) {
      setPriceStr('');
      setVehicleType('Pop Ride');
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  // ── Numpad handler (lógica sin tocar) ──
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

  return (
    <BottomSheet
      ref={sheetRef}
      index={visible ? 0 : -1}
      snapPoints={['92%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={s.sheetBg}
      handleComponent={null}
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

        {/* ── SECCIÓN 2: Hero Price Input ── */}
        <View style={s.heroContainer}>
          <View style={s.priceRow}>
            <Text style={s.currencyPrefix}>MX$</Text>
            <Text style={s.priceNumber}>{priceStr || ''}</Text>
            <Animated.View style={[s.cursor, cursorStyle]} />
          </View>
          <View style={s.priceDivider} />
          <Text style={s.priceSuggLabel}>Precio sugerido: MX${suggestedPriceRange?.min ?? 0} – MX${suggestedPriceRange?.max ?? 0}</Text>
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
                estimatedPrice={
                  suggestedPriceRange
                    ? Math.round(((((suggestedPriceRange.max - suggestedPriceRange.min)/2) + suggestedPriceRange.min) * (item.category === 'PREMIUM' || item.category === 'XL' ? 1.4 : item.category === 'COMFORT' ? 1.2 : 1)))
                    : undefined
                }
                onPress={() => setVehicleType(item.id)}
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

        {/* ── SECCIÓN 4: Pago ── */}
        <TouchableOpacity style={s.paymentRow} activeOpacity={0.75}>
          <Ionicons name={paymentIcon} size={20} color="rgba(255,255,255,0.75)" />
          <Text style={s.paymentLabel}>{paymentLabel}</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.40)" />
        </TouchableOpacity>

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
            onPress={() => { onConfirm(currentPrice, vehicleType, paymentMethod); onClose(); }}
            activeOpacity={0.88}
          >
            <Text style={[s.ctaText, isValid ? s.ctaTextEnabled : s.ctaTextDisabled]}>
              {isValid ? `Pedir ride → MX$${priceStr}` : 'Ingresa un precio'}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </BottomSheet>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  sheetBg: { backgroundColor: 'rgba(13,5,32,0.97)', borderTopLeftRadius: 28, borderTopRightRadius: 28 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 20,
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
    marginTop: 28,
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
    width: 130,
    height: 160,
    borderRadius: 16,
    padding: 12,
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
    height: 70,
    resizeMode: 'contain',
  },
  vehicleName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  vehicleNameSel: {
    color: '#F5C518',
  },
  vehicleNameUnsel: {
    color: '#FFFFFF',
  },
  vehiclePrice: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
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
    height: 58,
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

// Keep legacy style name alias so PassengerDashboard compile stays clean
const styles = s;
