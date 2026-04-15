import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Animated, Easing, Platform,
  FlatList, TouchableWithoutFeedback, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../hooks/useAppTheme';
import { useRideFlowStore } from '../store/useRideFlowStore';

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type VehicleCategory = 'ECONOMY' | 'COMFORT' | 'PREMIUM';

interface CategoryOption {
  category: VehicleCategory;
  label: string;
  description: string;
  priceMXN: number;
  minFareMXN: number;
  etaMin: number;
  distKm: number;
}

interface PriceInputSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (price: number, category: VehicleCategory) => void;
  categoryOptions: Record<VehicleCategory, CategoryOption> | null;
  loadingQuotes: boolean;
  destAddress?: string;
}

const CATEGORIES: VehicleCategory[] = ['ECONOMY', 'COMFORT', 'PREMIUM'];
// Mapeo básico a "Auto", etc si quieres, pero por consistencia usaremos lo que viene o este default
const CAT_LABELS: Record<string, string> = {
  ECONOMY: 'Auto',
  COMFORT: 'Confort',
  PREMIUM: 'Moto', // as per instructions sometimes it's auto/moto, we mock it here if not available
};

const NUMPAD_KEYS = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  '.', '0', 'BACK'
];

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ── Componente principal ──────────────────────────────────────────────────────
export default function PriceInputSheet({
  visible, onClose, onConfirm,
  categoryOptions, loadingQuotes, destAddress,
}: PriceInputSheetProps) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(theme, insets), [theme, insets]);

  const paymentMethod = useRideFlowStore(s => s.paymentMethod);
  const setPaymentMethod = useRideFlowStore(s => s.setPaymentMethod);

  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory>('ECONOMY');
  
  // Custom states para el Numpad
  const [priceText, setPriceText] = useState('');
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  const slideAnim = useRef(new Animated.Value(0)).current;

  // Blinking cursor
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (visible) {
      setCursorVisible(true);
      interval = setInterval(() => {
        setCursorVisible((v) => !v);
      }, 500);
    }
    return () => clearInterval(interval);
  }, [visible]);

  // Limpiar numpad on open if needed
  useEffect(() => {
    if (visible) {
      setPriceText('');
      // You can auto-select the suggested or leave it empty, requirements say:
      // "Al entrar a la pantalla: el cursor aparece inmediatamente ... NO mostrar '0' como placeholder — mostrar vacío"
    }
  }, [visible]);

  // Animación de entrada/salida
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 280,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const sheetTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleKeyPress = useCallback((key: string) => {
    setPriceText((prev) => {
      if (key === 'BACK') {
        return prev.slice(0, -1);
      }
      if (key === '.') {
        if (prev.includes('.')) return prev;
        if (prev === '') return '0.';
        return prev + '.';
      }
      // Max 4 digitos antes del punto
      const parts = prev.split('.');
      if (parts[0].length >= 4 && key !== '.' && prev.indexOf('.') === -1) return prev;
      
      // Si ya hay punto, max 2 decimales
      if (parts.length > 1 && parts[1].length >= 2) return prev;
      
      // No empezar con 0 a menos que sea 0.
      if (prev === '0' && key !== '.') return key;

      return prev + key;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const numericPrice = parseFloat(priceText);
    if (!isNaN(numericPrice) && numericPrice > 0) {
      onConfirm(numericPrice, selectedCategory);
    }
  }, [priceText, selectedCategory, onConfirm]);

  const PAYMENT_LABELS: Record<string, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    APPLE_PAY: 'Apple Pay',
    WALLET: 'B-Ride Wallet',
  };
  const PAYMENT_ICONS: Record<string, string> = {
    CASH: 'cash-outline',
    CARD: 'card-outline',
    APPLE_PAY: 'logo-apple',
    WALLET: 'wallet-outline',
  };

  const currentCategory = categoryOptions?.[selectedCategory];
  const suggestedMin = currentCategory?.minFareMXN ? Math.round(currentCategory.minFareMXN) : 40;
  const suggestedMax = currentCategory?.priceMXN ? Math.round(currentCategory.priceMXN * 1.3) : 100;
  const numPrice = parseFloat(priceText) || 0;
  const priceOk = numPrice > 0;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableWithoutFeedback onPress={() => onClose()}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]} pointerEvents="box-none">
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Close Btn Header */}
        <View style={styles.headerAbsolute}>
           <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
             <Ionicons name="close" size={16} color="#ffffff" />
           </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {/* SECCIÓN 1 — INPUT DE PRECIO */}
          <View style={styles.priceHero}>
            <View style={styles.priceContainer}>
              <Text style={styles.currencyPrefix}>MX$</Text>
              <Text style={styles.priceValue}>{priceText}</Text>
              <View style={[styles.cursor, { opacity: cursorVisible ? 1 : 0 }]} />
            </View>
            <View style={styles.priceLine} />
            <Text style={styles.priceHint}>Precio sugerido: ${suggestedMin} – ${suggestedMax}</Text>
          </View>

          {/* SECCIÓN 2 — MÉTODO DE PAGO */}
          <TouchableOpacity style={styles.paymentMethodRow} onPress={() => setShowPaymentPicker(true)} activeOpacity={0.8}>
            <View style={styles.paymentMethodLeft}>
              <Ionicons name={PAYMENT_ICONS[paymentMethod] as any} size={18} color="#FFFFFF" />
              <Text style={styles.paymentMethodLabel}>{PAYMENT_LABELS[paymentMethod]}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#888888" />
          </TouchableOpacity>

          {/* SECCIÓN 3 — TIPO DE VEHÍCULO */}
          <View style={styles.vehicleCategorySection}>
            <Text style={styles.vehicleCategoryHeader}>Tipo de vehículo</Text>
            <FlatList
              data={CATEGORIES}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={item => item}
              contentContainerStyle={styles.vehicleList}
              renderItem={({ item }) => {
                const isSelected = selectedCategory === item;
                const label = CAT_LABELS[item] || item;
                return (
                  <TouchableOpacity
                    style={[styles.vehicleChip, isSelected && styles.vehicleChipSelected]}
                    onPress={() => setSelectedCategory(item)}
                    activeOpacity={0.7}
                  >
                    {isSelected && <Ionicons name="checkmark" size={14} color="#0D0520" style={{ marginRight: 4 }} />}
                    <Text style={[styles.vehicleChipText, isSelected && styles.vehicleChipTextSelected]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>

          {/* SECCIÓN 4 — NUMPAD CUSTOM */}
          <View style={styles.numpadGrid}>
            {NUMPAD_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                style={styles.numpadKey}
                onPress={() => handleKeyPress(key)}
                activeOpacity={0.7}
                // We use standard TouchableOpacity which adds opacity on press, 
                // for ripple effect in bare RN we can just modify the underlay wrapper or rely on activeOpacity
              >
                {key === 'BACK' ? (
                  <Ionicons name="backspace-outline" size={28} color="#FFFFFF" />
                ) : (
                  <Text style={styles.numpadKeyText}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* SECCIÓN 5 — CTA PRINCIPAL */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.ctaButton, !priceOk && styles.ctaButtonDisabled]}
              onPress={handleConfirm}
              disabled={!priceOk}
              activeOpacity={0.85}
            >
              <Text style={[styles.ctaButtonText, !priceOk && styles.ctaButtonTextDisabled]}>
                {priceOk ? 'Buscar conductor →' : 'Ingresa un precio'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Payment method picker modal simple */}
      {showPaymentPicker && (
        <PaymentMethodPicker
          current={paymentMethod}
          onSelect={(m: any) => { setPaymentMethod(m); setShowPaymentPicker(false); }}
          onClose={() => setShowPaymentPicker(false)}
          theme={theme}
        />
      )}
    </Modal>
  );
}

// ── Payment Method Picker embebido ─────────────────────────────────────────────
function PaymentMethodPicker({ current, onSelect, onClose, theme }: any) {
  const insets = useSafeAreaInsets();
  const METHODS = [
    { key: 'CASH',      label: 'Efectivo',       icon: 'cash-outline',   desc: 'Pagas directamente al conductor' },
    { key: 'CARD',      label: 'Tarjeta',         icon: 'card-outline',   desc: 'Débito o crédito vía Stripe' },
    { key: 'WALLET',    label: 'B-Ride Wallet',   icon: 'wallet-outline', desc: 'Saldo en tu cuenta B-Ride' },
    ...(Platform.OS === 'ios' ? [{ key: 'APPLE_PAY', label: 'Apple Pay', icon: 'logo-apple', desc: 'Face ID / Touch ID' }] : []),
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(5,2,15,0.6)', justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <View style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingBottom: insets.bottom + 16,
              paddingTop: 16, paddingHorizontal: 20,
              borderTopWidth: 1, borderColor: theme.colors.border,
            }}>
              <Text style={{ ...theme.typography.title, marginBottom: 16, color: '#fff' }}>Método de pago</Text>
              {METHODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => onSelect(m.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingVertical: 14, paddingHorizontal: 12,
                    borderRadius: theme.borderRadius.m, marginBottom: 6,
                    backgroundColor: current === m.key ? theme.colors.primaryLight : theme.colors.surfaceHigh,
                    borderWidth: 1.5,
                    borderColor: current === m.key ? theme.colors.primary : theme.colors.border,
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={m.icon as any} size={22} color={current === m.key ? theme.colors.primary : theme.colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...theme.typography.body, fontWeight: '600', color: current === m.key ? theme.colors.primary : '#fff' }}>
                      {m.label}
                    </Text>
                  </View>
                  {current === m.key && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const getStyles = (theme: any, insets: any) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,5,32,0.85)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '92%',
    backgroundColor: 'rgba(13,5,32,0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Math.max(insets.bottom, 20),
    // Blur is handled by background transparent if supported, or wrapped in a BlurView in a real device.
    // We use a dark semi-transparent color simulating it for this pure RN implementation.
  },
  handleRow: { paddingTop: 10, paddingBottom: 10, alignItems: 'center' },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  headerAbsolute: {
    position: 'absolute',
    top: 16, right: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  
  // SECCIÓN 1
  priceHero: {
    alignItems: 'center',
    marginBottom: 20,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  currencyPrefix: {
    color: '#888888',
    fontSize: 36,
    fontWeight: '300',
    marginRight: 6,
  },
  priceValue: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '700',
  },
  cursor: {
    width: 3,
    height: 56,
    backgroundColor: '#F5C518',
    marginLeft: 6,
    transform: [{ translateY: 6 }]
  },
  priceLine: {
    width: '50%',
    height: 1.5,
    backgroundColor: 'rgba(245,197,24,0.30)',
    marginTop: 4,
    marginBottom: 10,
  },
  priceHint: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '400',
  },

  // SECCIÓN 2
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paymentMethodLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // SECCIÓN 3
  vehicleCategorySection: {
    marginBottom: 24,
  },
  vehicleCategoryHeader: {
    color: '#888888',
    fontSize: 12,
    marginBottom: 10,
  },
  vehicleList: {
    gap: 12,
    paddingRight: 20,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  vehicleChipSelected: {
    backgroundColor: '#F5C518',
    borderColor: '#F5C518',
  },
  vehicleChipText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
  },
  vehicleChipTextSelected: {
    color: '#0D0520',
    fontWeight: '700',
  },

  // SECCIÓN 4
  numpadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 16,
    rowGap: 12,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  numpadKey: {
    width: '30%',
    aspectRatio: 1.8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  numpadKeyText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '300',
  },

  // SECCIÓN 5
  footer: {
    marginTop: 'auto',
  },
  ctaButton: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F5C518',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F5C518',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    shadowOpacity: 0,
  },
  ctaButtonText: {
    color: '#0D0520',
    fontSize: 17,
    fontWeight: '800',
  },
  ctaButtonTextDisabled: {
    color: '#888888',
  },
});

