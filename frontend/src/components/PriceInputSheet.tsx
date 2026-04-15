import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Animated, Image, FlatList,
  TouchableWithoutFeedback, Dimensions, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../hooks/useAppTheme';
import { useRideFlowStore } from '../store/useRideFlowStore';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type VehicleCategory = 'ECONOMY' | 'COMFORT' | 'PREMIUM' | 'GROUP';

interface CategoryOption {
  category: VehicleCategory;
  priceMXN: number;
  minFareMXN?: number;
  dynamicMinFare?: number; // calculado por demanda/tráfico
  etaMin: number;
  distKm?: number;
  demandLevel?: 'low' | 'medium' | 'high'; // nivel de demanda de la zona
}

interface PriceInputSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (price: number, category: VehicleCategory) => void;
  categoryOptions: Record<string, CategoryOption> | null;
  loadingQuotes: boolean;
  destAddress?: string;
  distanceKm?: number;
  estimatedMinutes?: number;
}

// ── Identidad de marca B-Ride ─────────────────────────────────────────────────
const VEHICLE_CATALOG = {
  ECONOMY: {
    name: 'Pop Ride',
    tagline: 'Tu ride del día',
    seats: 4,
    image: require('../../assets/vehicles/pop_ride.png'),
    color: '#C4B8E0',
    accentColor: '#A89BC8',
  },
  COMFORT: {
    name: 'Flow Ride',
    tagline: 'Viaja con estilo',
    seats: 4,
    image: require('../../assets/vehicles/flow_ride.png'),
    color: '#3D8EF0',
    accentColor: '#2D7DE0',
  },
  PREMIUM: {
    name: 'Black Ride',
    tagline: 'Elegancia sin límites',
    seats: 4,
    image: require('../../assets/vehicles/black_ride.png'),
    color: '#F5C518',
    accentColor: '#D4A800',
  },
  GROUP: {
    name: 'Big Ride',
    tagline: 'Espacio para todos',
    seats: 7,
    image: require('../../assets/vehicles/big_ride.png'),
    color: '#00D4C8',
    accentColor: '#00B8AD',
  },
};

const CATEGORIES: VehicleCategory[] = ['ECONOMY', 'COMFORT', 'PREMIUM', 'GROUP'];

// ── Calcular mínimo dinámico ───────────────────────────────────────────────────
// Basado en: demanda de zona, tráfico por hora y distancia base
function computeDynamicMin(
  baseMin: number,
  demandLevel: 'low' | 'medium' | 'high' = 'low',
  distanceKm: number = 0,
): number {
  const hour = new Date().getHours();
  // Multiplicadores de tráfico: rush morning (7-9), rush evening (17-19)
  const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19);
  const isNight = hour >= 22 || hour <= 5;
  const trafficMult = isRushHour ? 1.35 : isNight ? 1.20 : 1.0;

  // Multiplicadores de demanda
  const demandMult = demandLevel === 'high' ? 1.40 : demandLevel === 'medium' ? 1.15 : 1.0;

  // Base mínimo por distancia: no puede ser menor a 25 + 3.5 MXN/km
  const distBase = 25 + Math.max(0, distanceKm) * 3.5;

  const computed = Math.max(baseMin, distBase) * trafficMult * demandMult;
  return Math.ceil(computed / 5) * 5; // redondear al múltiplo de 5 más cercano
}

function getDemandLabel(level: 'low' | 'medium' | 'high' = 'low') {
  if (level === 'high') return '🔥 Alta demanda';
  if (level === 'medium') return '⚡ Demanda normal';
  return null;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'BACK'];

// ── Componente principal ──────────────────────────────────────────────────────
export default function PriceInputSheet({
  visible, onClose, onConfirm,
  categoryOptions, loadingQuotes, destAddress,
  distanceKm = 0, estimatedMinutes = 0,
}: PriceInputSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  const paymentMethod = useRideFlowStore(s => s.paymentMethod);
  const setPaymentMethod = useRideFlowStore(s => s.setPaymentMethod);

  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory>('ECONOMY');
  const [priceText, setPriceText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;

  // Cursor parpadeante
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (visible) {
      setCursorVisible(true);
      interval = setInterval(() => setCursorVisible(v => !v), 500);
    }
    return () => clearInterval(interval);
  }, [visible]);

  // Auto-rellenar precio sugerido al seleccionar categoría
  useEffect(() => {
    if (!visible) return;
    const catKey = selectedCategory;
    const opt = categoryOptions?.[catKey];
    if (opt?.priceMXN && opt.priceMXN > 0) {
      setPriceText(opt.priceMXN.toFixed(0));
    } else {
      setPriceText('');
    }
  }, [visible, selectedCategory, categoryOptions]);

  // Animación modal
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1, damping: 22, stiffness: 280, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  // Numpad handlers
  const handleNumpad = useCallback((key: string) => {
    if (key === 'BACK') {
      setPriceText(p => p.slice(0, -1));
      return;
    }
    if (key === '.' && priceText.includes('.')) return;
    if (priceText.length >= 6) return;
    const afterDecimal = priceText.split('.')[1];
    if (afterDecimal && afterDecimal.length >= 2) return;
    setPriceText(p => p + key);
  }, [priceText]);

  const numericPrice = parseFloat(priceText) || 0;

  // Datos de la categoría seleccionada
  const selectedOpt = categoryOptions?.[selectedCategory];
  const catalog = VEHICLE_CATALOG[selectedCategory];
  const demandLevel = (selectedOpt?.demandLevel ?? 'low') as 'low' | 'medium' | 'high';

  const dynamicMin = computeDynamicMin(
    selectedOpt?.minFareMXN ?? 25,
    demandLevel,
    distanceKm,
  );

  const isUnderMin = numericPrice > 0 && numericPrice < dynamicMin;
  const isBelowSuggested = numericPrice > 0 && selectedOpt?.priceMXN && numericPrice < selectedOpt.priceMXN;
  const canConfirm = numericPrice >= dynamicMin;

  const demandLabel = getDemandLabel(demandLevel);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(numericPrice, selectedCategory);
  }, [numericPrice, selectedCategory, canConfirm, onConfirm]);

  const paymentLabel = paymentMethod === 'CASH' ? 'Efectivo'
    : paymentMethod === 'CARD' ? 'Tarjeta'
    : paymentMethod === 'APPLE_PAY' ? 'Apple Pay'
    : 'Wallet';

  const paymentIcon = paymentMethod === 'CASH' ? 'cash-outline'
    : paymentMethod === 'CARD' ? 'card-outline'
    : paymentMethod === 'APPLE_PAY' ? 'logo-apple'
    : 'wallet-outline';

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <Animated.View style={[styles.sheet, { transform: [{ translateY }], paddingBottom: insets.bottom + 12 }]}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Elige tu ride</Text>
          {destAddress ? (
            <Text style={styles.headerSub} numberOfLines={1}>→ {destAddress}</Text>
          ) : null}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* ── Selector de vehículos ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catsRow}
          >
            {CATEGORIES.map(cat => {
              const c = VEHICLE_CATALOG[cat];
              const opt = categoryOptions?.[cat];
              const isSelected = selectedCategory === cat;
              const min = computeDynamicMin(opt?.minFareMXN ?? 25, opt?.demandLevel ?? 'low', distanceKm);
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catCard, isSelected && { borderColor: c.color, borderWidth: 2 }]}
                  onPress={() => setSelectedCategory(cat)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={isSelected
                      ? [`${c.color}22`, 'rgba(26,10,53,0.95)']
                      : ['rgba(26,10,53,0.95)', 'rgba(26,10,53,0.95)']}
                    style={styles.catCardGrad}
                  >
                    {/* Imagen del coche */}
                    <Image source={c.image} style={styles.catCarImage} resizeMode="contain" />

                    {/* Badge demand */}
                    {opt?.demandLevel && opt.demandLevel !== 'low' && (
                      <View style={[styles.demandBadge, { backgroundColor: opt.demandLevel === 'high' ? 'rgba(255,87,34,0.85)' : 'rgba(245,197,24,0.85)' }]}>
                        <Text style={styles.demandBadgeText}>
                          {opt.demandLevel === 'high' ? '🔥' : '⚡'}
                        </Text>
                      </View>
                    )}

                    <Text style={[styles.catName, isSelected && { color: c.color }]}>{c.name}</Text>
                    <Text style={styles.catTagline}>{c.tagline}</Text>

                    <View style={styles.catMetaRow}>
                      <Text style={[styles.catPrice, isSelected && { color: c.color }]}>
                        {loadingQuotes ? '...' : opt?.priceMXN ? `MX$${opt.priceMXN.toFixed(0)}` : `MX$${min}`}
                      </Text>
                      <Text style={styles.catEta}>
                        {opt?.etaMin ? `~${opt.etaMin} min` : `~${estimatedMinutes || '?'} min`}
                      </Text>
                    </View>

                    <View style={styles.catSeatsRow}>
                      <Ionicons name="people-outline" size={12} color="rgba(255,255,255,0.4)" />
                      <Text style={styles.catSeats}>{c.seats} personas</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── Info de la categoría seleccionada ── */}
          <View style={styles.selectedInfo}>
            <View style={styles.selectedInfoLeft}>
              <Text style={[styles.selectedName, { color: catalog.color }]}>{catalog.name}</Text>
              <Text style={styles.selectedTagline}>{catalog.tagline}</Text>
            </View>
            <View style={styles.selectedInfoRight}>
              {distanceKm > 0 && (
                <Text style={styles.distanceLabel}>{distanceKm.toFixed(1)} km</Text>
              )}
              {estimatedMinutes > 0 && (
                <Text style={styles.etaLabel}>{estimatedMinutes} min estimado</Text>
              )}
            </View>
          </View>

          {/* Banner de demanda/mínimo dinámico */}
          {(demandLabel || dynamicMin > 25) && (
            <View style={[styles.demandBanner, {
              backgroundColor: demandLevel === 'high' ? 'rgba(255,87,34,0.12)' : 'rgba(245,197,24,0.10)',
              borderColor: demandLevel === 'high' ? 'rgba(255,87,34,0.30)' : 'rgba(245,197,24,0.25)',
            }]}>
              <Text style={[styles.demandBannerText, {
                color: demandLevel === 'high' ? '#FF5722' : '#F5C518',
              }]}>
                {demandLabel ? `${demandLabel} · ` : ''}Oferta desde MX${dynamicMin} para atraer más conductores
              </Text>
            </View>
          )}

          {/* ── Numpad + Display ── */}
          <View style={styles.priceSection}>
            <Text style={styles.priceSectionLabel}>Tu oferta</Text>

            {/* Display del precio */}
            <View style={styles.priceDisplay}>
              <Text style={styles.priceCurrency}>MX$</Text>
              <Text style={[styles.priceValue, isUnderMin && styles.priceValueError]}>
                {priceText || '0'}
              </Text>
              <View style={[styles.cursor, { opacity: cursorVisible ? 1 : 0 }]} />
            </View>

            {/* Feedback visual */}
            {isUnderMin && (
              <Text style={styles.minWarning}>
                Mínimo MX${dynamicMin} — sube un poco para atraer conductores
              </Text>
            )}
            {isBelowSuggested && !isUnderMin && (
              <Text style={styles.minTip}>
                El precio sugerido es MX${selectedOpt?.priceMXN?.toFixed(0)} — una oferta mayor atrae más rápido
              </Text>
            )}

            {/* Numpad */}
            <View style={styles.numpad}>
              {NUMPAD_KEYS.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.numKey, key === 'BACK' && styles.numKeyBack]}
                  onPress={() => handleNumpad(key)}
                  activeOpacity={0.7}
                >
                  {key === 'BACK' ? (
                    <Ionicons name="backspace-outline" size={22} color="#FFFFFF" />
                  ) : (
                    <Text style={styles.numKeyText}>{key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Método de pago ── */}
          <TouchableOpacity
            style={styles.paymentRow}
            onPress={() => setShowPaymentPicker(v => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.paymentLeft}>
              <Ionicons name={paymentIcon as any} size={18} color={catalog.color} />
              <Text style={styles.paymentLabel}>{paymentLabel}</Text>
            </View>
            <Ionicons name={showPaymentPicker ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>

          {showPaymentPicker && (
            <View style={styles.paymentOptions}>
              {(['CASH', 'CARD', 'APPLE_PAY', 'WALLET'] as const).map(m => {
                const icons = { CASH: 'cash-outline', CARD: 'card-outline', APPLE_PAY: 'logo-apple', WALLET: 'wallet-outline' };
                const labels = { CASH: 'Efectivo', CARD: 'Tarjeta', APPLE_PAY: 'Apple Pay', WALLET: 'Wallet' };
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.paymentOption, paymentMethod === m && { backgroundColor: 'rgba(245,197,24,0.12)' }]}
                    onPress={() => { setPaymentMethod(m); setShowPaymentPicker(false); }}
                  >
                    <Ionicons name={icons[m] as any} size={18} color={paymentMethod === m ? '#F5C518' : 'rgba(255,255,255,0.6)'} />
                    <Text style={[styles.paymentOptionText, paymentMethod === m && { color: '#F5C518' }]}>{labels[m]}</Text>
                    {paymentMethod === m && <Ionicons name="checkmark" size={16} color="#F5C518" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── CTA ── */}
          <TouchableOpacity
            style={[styles.cta, !canConfirm && styles.ctaDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canConfirm ? ['#F5C518', '#D4A800'] : ['#241245', '#241245']}
              style={styles.ctaGrad}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Text style={[styles.ctaText, !canConfirm && styles.ctaTextDisabled]}>
                {canConfirm
                  ? `Vamos → MX$${numericPrice.toFixed(0)}`
                  : `Mínimo MX$${dynamicMin}`}
              </Text>
              {canConfirm && <Ionicons name="arrow-forward" size={20} color="#0D0520" style={{ marginLeft: 8 }} />}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
function getStyles(theme: any, insets: any) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(5,2,15,0.72)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#120828',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderTopWidth: 1,
      borderColor: 'rgba(245,197,24,0.15)',
      maxHeight: SCREEN_HEIGHT * 0.92,
    },
    handle: {
      width: 40, height: 4, borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignSelf: 'center', marginTop: 12, marginBottom: 4,
    },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 12,
    },
    headerTitle: {
      color: '#FFFFFF', fontSize: 20, fontWeight: '700', flex: 1,
    },
    headerSub: {
      color: 'rgba(255,255,255,0.5)', fontSize: 12,
      position: 'absolute', bottom: -4, left: 20,
    },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.06)',
      justifyContent: 'center', alignItems: 'center',
    },

    // ── Vehicle Selector ──
    catsRow: {
      paddingHorizontal: 16, paddingVertical: 8, gap: 12,
      flexDirection: 'row',
    },
    catCard: {
      width: 148, borderRadius: 18,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    },
    catCardGrad: {
      padding: 14, alignItems: 'flex-start',
    },
    catCarImage: {
      width: '100%', height: 80, marginBottom: 8,
    },
    demandBadge: {
      position: 'absolute', top: 10, right: 10,
      borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    },
    demandBadgeText: { fontSize: 12 },
    catName: {
      color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginBottom: 2,
    },
    catTagline: {
      color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 10,
    },
    catMetaRow: {
      flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4,
    },
    catPrice: {
      color: '#FFFFFF', fontSize: 16, fontWeight: '800',
    },
    catEta: {
      color: 'rgba(255,255,255,0.5)', fontSize: 12,
    },
    catSeatsRow: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
    },
    catSeats: {
      color: 'rgba(255,255,255,0.35)', fontSize: 11,
    },

    // ── Selected info bar ──
    selectedInfo: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 10,
      borderTopWidth: 1, borderBottomWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
      marginTop: 4,
    },
    selectedInfoLeft: {},
    selectedName: { fontSize: 17, fontWeight: '700' },
    selectedTagline: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
    selectedInfoRight: { alignItems: 'flex-end' },
    distanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
    etaLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

    // ── Demand Banner ──
    demandBanner: {
      marginHorizontal: 20, marginTop: 10, marginBottom: 4,
      borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    demandBannerText: { fontSize: 12, fontWeight: '600' },

    // ── Price Section ──
    priceSection: {
      paddingHorizontal: 20, paddingTop: 12,
    },
    priceSectionLabel: {
      color: 'rgba(255,255,255,0.4)', fontSize: 11,
      fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase',
      marginBottom: 8,
    },
    priceDisplay: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', marginBottom: 4,
    },
    priceCurrency: {
      color: 'rgba(255,255,255,0.5)', fontSize: 28, fontWeight: '300',
      marginRight: 4, marginTop: 6,
    },
    priceValue: {
      color: '#FFFFFF', fontSize: 52, fontWeight: '800', letterSpacing: -1,
    },
    priceValueError: { color: '#FF5722' },
    cursor: {
      width: 3, height: 50, backgroundColor: '#F5C518',
      borderRadius: 2, marginLeft: 4, marginTop: 4,
    },
    minWarning: {
      color: '#FF5722', fontSize: 12, textAlign: 'center', marginBottom: 6,
    },
    minTip: {
      color: '#F5C518', fontSize: 12, textAlign: 'center', marginBottom: 6,
    },
    numpad: {
      flexDirection: 'row', flexWrap: 'wrap',
      marginTop: 10, gap: 8,
    },
    numKey: {
      width: '30%', aspectRatio: 1.6,
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderRadius: 12, justifyContent: 'center', alignItems: 'center',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    },
    numKeyBack: {
      backgroundColor: 'rgba(255,87,34,0.10)',
      borderColor: 'rgba(255,87,34,0.15)',
    },
    numKeyText: {
      color: '#FFFFFF', fontSize: 22, fontWeight: '600',
    },

    // ── Payment ──
    paymentRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: 20, marginTop: 16,
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    },
    paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    paymentLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
    paymentOptions: {
      marginHorizontal: 20, marginTop: 4, borderRadius: 12, overflow: 'hidden',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    },
    paymentOption: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    paymentOptionText: {
      color: 'rgba(255,255,255,0.7)', fontSize: 14, flex: 1,
    },

    // ── CTA ──
    cta: {
      marginHorizontal: 20, marginTop: 16, marginBottom: 8,
      borderRadius: 16, overflow: 'hidden',
    },
    ctaDisabled: { opacity: 0.5 },
    ctaGrad: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 18,
    },
    ctaText: {
      color: '#0D0520', fontSize: 17, fontWeight: '800',
    },
    ctaTextDisabled: { color: 'rgba(255,255,255,0.4)' },
  });
}
