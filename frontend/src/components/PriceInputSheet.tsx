/**
 * PriceInputSheet — Hoja de ingreso de precio para B-Ride
 * 
 * UX: Se desliza desde abajo. Muestra el precio grande centrado,
 * selector de categoría como chips, método de pago y botón de confirmar.
 * El teclado numérico nativo aparece al abrir para editar el precio.
 */
import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, Animated, Easing, Platform, KeyboardAvoidingView,
  ScrollView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
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

// ── Íconos SVG por categoría ──────────────────────────────────────────────────
const EconomyIcon = ({ color, size = 28 }: { color: string; size?: number }) => (
  <Svg width={size * 1.8} height={size} viewBox="0 0 50 28" fill="none">
    <Path d="M8 12 L14 5 H36 L42 12" stroke={color} strokeWidth={2} strokeLinejoin="round" fill="none" />
    <Rect x="4" y="12" width="42" height="10" rx="4" fill={color} opacity={0.3} />
    <Rect x="4" y="12" width="42" height="10" rx="4" stroke={color} strokeWidth={1.5} fill="none" />
    <Circle cx="13" cy="23" r="3.5" fill={color} />
    <Circle cx="37" cy="23" r="3.5" fill={color} />
    <Rect x="16" y="5.5" width="18" height="6.5" rx="1.5" fill={color} opacity={0.4} />
  </Svg>
);

const ComfortIcon = ({ color, size = 28 }: { color: string; size?: number }) => (
  <Svg width={size * 1.8} height={size} viewBox="0 0 50 28" fill="none">
    <Path d="M6 13 L13 4 H37 L44 13" stroke={color} strokeWidth={2.2} strokeLinejoin="round" fill="none" />
    <Rect x="2" y="13" width="46" height="11" rx="5" fill={color} opacity={0.3} />
    <Rect x="2" y="13" width="46" height="11" rx="5" stroke={color} strokeWidth={1.5} fill="none" />
    <Path d="M2 18 H48" stroke={color} strokeWidth={0.8} opacity={0.5} />
    <Circle cx="13" cy="25" r="4" fill={color} />
    <Circle cx="37" cy="25" r="4" fill={color} />
    <Rect x="17" y="4.5" width="16" height={7} rx={2} fill={color} opacity={0.5} />
  </Svg>
);

const PremiumIcon = ({ color, size = 28 }: { color: string; size?: number }) => (
  <Svg width={size * 1.8} height={size} viewBox="0 0 50 28" fill="none">
    <Path d="M4 14 L11 3 H39 L46 14" stroke={color} strokeWidth={2.4} strokeLinejoin="round" fill="none" />
    <Rect x="1" y="14" width="48" height="11" rx="5.5" fill={color} opacity={0.35} />
    <Rect x="1" y="14" width="48" height="11" rx="5.5" stroke={color} strokeWidth={2} fill="none" />
    <Path d="M1 19 H49" stroke={color} strokeWidth={1} opacity={0.4} />
    <Circle cx="12" cy="26" r="4.5" fill={color} />
    <Circle cx="38" cy="26" r="4.5" fill={color} />
    <Rect x="16" y="3.5" width="18" height={8} rx={2.5} fill={color} opacity={0.55} />
    <Path d="M38 3 L40 0" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
  </Svg>
);

const ICONS = { ECONOMY: EconomyIcon, COMFORT: ComfortIcon, PREMIUM: PremiumIcon };
const CATEGORIES: VehicleCategory[] = ['ECONOMY', 'COMFORT', 'PREMIUM'];
const CAT_COLORS: Record<VehicleCategory, string> = {
  ECONOMY:  '#00D4C8',   // turquesa
  COMFORT:  '#F5C518',   // dorado
  PREMIUM:  '#9C27B0',   // morado
};

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
  const [priceText, setPriceText] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Cuando cambia categoría, actualizar precio al sugerido
  useEffect(() => {
    if (categoryOptions && selectedCategory) {
      const suggested = categoryOptions[selectedCategory]?.priceMXN;
      if (suggested) setPriceText(String(suggested));
      setPriceError(null);
    }
  }, [selectedCategory, categoryOptions]);

  // Animación de entrada/salida
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 280,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
      });
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
    outputRange: [600, 0],
  });

  const overlayOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const handleConfirm = useCallback(() => {
    const numericPrice = parseFloat(priceText.replace(',', '.'));
    const minFare = categoryOptions?.[selectedCategory]?.minFareMXN ?? 45;

    if (isNaN(numericPrice) || numericPrice <= 0) {
      setPriceError('Ingresa un precio válido');
      return;
    }
    if (numericPrice < minFare) {
      setPriceError(`Mínimo MX$${minFare} para ${selectedCategory}`);
      return;
    }
    if (numericPrice > 2000) {
      setPriceError('Precio máximo MX$2,000');
      return;
    }

    Keyboard.dismiss();
    onConfirm(numericPrice, selectedCategory);
  }, [priceText, selectedCategory, categoryOptions, onConfirm]);

  const handlePriceChange = (val: string) => {
    // Solo números y un punto decimal
    const clean = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setPriceText(clean);
    setPriceError(null);

    // Validación en vivo
    const num = parseFloat(clean);
    const minFare = categoryOptions?.[selectedCategory]?.minFareMXN ?? 45;
    if (!isNaN(num) && num > 0 && num < minFare) {
      setPriceError(`Mínimo MX$${minFare} — los conductores no aceptarán menos`);
    }
  };

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
  const numPrice = parseFloat(priceText) || 0;
  const minFare = currentCategory?.minFareMXN ?? 45;
  const priceOk = numPrice >= minFare && numPrice <= 2000;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Sheet */}
      <KeyboardAvoidingView
        style={styles.kvContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslate }] }]}>

          {/* Handle + header */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Ofrece tu precio</Text>
              {destAddress && (
                <Text style={styles.headerSub} numberOfLines={1}>→ {destAddress}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >

            {/* ── PRECIO GRANDE ─────────────────────────────────────────── */}
            <View style={styles.priceBlock}>
              <View style={styles.priceInputRow}>
                <Text style={styles.currencySymbol}>MX$</Text>
                <TextInput
                  ref={inputRef}
                  style={[styles.priceInput, priceError ? styles.priceInputError : priceOk && numPrice > 0 ? styles.priceInputOk : null]}
                  value={priceText}
                  onChangeText={handlePriceChange}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={handleConfirm}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={6}
                  selectionColor={theme.colors.primary}
                />
              </View>

              {/* Línea decorativa bajo el precio */}
              <View style={[
                styles.priceLine,
                priceError ? styles.priceLineError : priceOk && numPrice > 0 ? styles.priceLineOk : null,
              ]} />

              {/* Mensaje de error / info */}
              {priceError ? (
                <View style={styles.errorRow}>
                  <Ionicons name="warning-outline" size={14} color={theme.colors.error} />
                  <Text style={styles.errorText}>{priceError}</Text>
                </View>
              ) : currentCategory && numPrice > 0 ? (
                <Text style={styles.priceHint}>
                  Sugerido: MX${currentCategory.priceMXN} · {currentCategory.etaMin} min · {currentCategory.distKm} km
                </Text>
              ) : (
                <Text style={styles.priceHint}>
                  Precio mínimo: MX${minFare}
                </Text>
              )}
            </View>

            {/* ── CATEGORÍAS ────────────────────────────────────────────── */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Tipo de vehículo</Text>
              <View style={styles.categoryRow}>
                {loadingQuotes ? (
                  <View style={styles.loadingCats}>
                    {CATEGORIES.map(cat => (
                      <View key={cat} style={styles.categoryChipSkeleton} />
                    ))}
                  </View>
                ) : (
                  CATEGORIES.map((cat) => {
                    const opt = categoryOptions?.[cat];
                    const isSelected = selectedCategory === cat;
                    const catColor = CAT_COLORS[cat];
                    const Icon = ICONS[cat];

                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.categoryChip,
                          isSelected && { borderColor: catColor, backgroundColor: `${catColor}18` },
                        ]}
                        onPress={() => setSelectedCategory(cat)}
                        activeOpacity={0.8}
                      >
                        {/* Checkmark o vacío */}
                        <View style={[
                          styles.chipCheck,
                          isSelected && { backgroundColor: catColor, borderColor: catColor },
                        ]}>
                          {isSelected && (
                            <Ionicons name="checkmark" size={10} color="#000" />
                          )}
                        </View>

                        {/* Ícono del coche */}
                        <Icon color={isSelected ? catColor : theme.colors.textMuted} size={22} />

                        {/* Label */}
                        <Text style={[
                          styles.chipLabel,
                          isSelected && { color: catColor, fontWeight: '700' },
                        ]}>
                          {opt?.label ?? cat}
                        </Text>

                        {/* Precio */}
                        {opt && (
                          <Text style={[
                            styles.chipPrice,
                            isSelected && { color: catColor },
                          ]}>
                            MX${opt.priceMXN}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>

            {/* ── MÉTODO DE PAGO ─────────────────────────────────────────── */}
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionLabel}>Pago</Text>
              <TouchableOpacity
                style={styles.paymentRow}
                onPress={() => setShowPaymentPicker(true)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={(PAYMENT_ICONS[paymentMethod] || 'card-outline') as any}
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={styles.paymentLabel}>
                  {PAYMENT_LABELS[paymentMethod] || 'Seleccionar método'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* ── INFO DEL VIAJE ─────────────────────────────────────────── */}
            {currentCategory && (
              <View style={styles.tripInfoRow}>
                <View style={styles.tripInfoItem}>
                  <Ionicons name="map-outline" size={14} color={theme.colors.turquesa} />
                  <Text style={styles.tripInfoText}>{currentCategory.distKm} km</Text>
                </View>
                <View style={styles.tripInfoDot} />
                <View style={styles.tripInfoItem}>
                  <Ionicons name="time-outline" size={14} color={theme.colors.turquesa} />
                  <Text style={styles.tripInfoText}>{currentCategory.etaMin} min aprox.</Text>
                </View>
                <View style={styles.tripInfoDot} />
                <View style={styles.tripInfoItem}>
                  <Ionicons name="people-outline" size={14} color={theme.colors.turquesa} />
                  <Text style={styles.tripInfoText}>4 personas</Text>
                </View>
              </View>
            )}

          </ScrollView>

          {/* ── BOTÓN CONFIRMAR ──────────────────────────────────────────── */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, !priceOk && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!priceOk}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmBtnText}>
                {priceOk
                  ? `Solicitar · MX$${Math.round(numPrice)}`
                  : 'Ingresa un precio válido'}
              </Text>
              {priceOk && (
                <Ionicons name="arrow-forward-circle" size={22} color={theme.colors.primaryText} />
              )}
            </TouchableOpacity>
          </View>

        </Animated.View>
      </KeyboardAvoidingView>

      {/* Payment method picker (modal simple dentro) */}
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
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 }} />
              <Text style={{ ...theme.typography.title, marginBottom: 16 }}>Método de pago</Text>
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
                    <Text style={{ ...theme.typography.body, fontWeight: '600', color: current === m.key ? theme.colors.primary : theme.colors.text }}>
                      {m.label}
                    </Text>
                    <Text style={{ ...theme.typography.caption, color: theme.colors.textMuted }}>{m.desc}</Text>
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
    backgroundColor: 'rgba(5,2,15,0.72)',
  },
  kvContainer: {
    flex: 1, justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  } as any,
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingBottom: insets.bottom + 12,
    maxHeight: '88%',
  },
  handleRow: { paddingTop: 10, paddingBottom: 4, alignItems: 'center' },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.l, paddingBottom: theme.spacing.m,
    gap: 12,
  },
  headerTitle: { ...theme.typography.title, fontSize: 20 },
  headerSub: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: theme.colors.surfaceHigh,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.l,
    paddingBottom: theme.spacing.m,
  },
  // ── PRECIO ──────────────────────────────────────────────────────────────────
  priceBlock: { alignItems: 'center', paddingVertical: theme.spacing.l },
  priceInputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    gap: 6, justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 28, fontWeight: '700',
    color: theme.colors.textMuted,
    paddingBottom: 8,
  },
  priceInput: {
    fontSize: 64, fontWeight: '800',
    color: theme.colors.text,
    minWidth: 120, textAlign: 'center',
    padding: 0,
  },
  priceInputError: { color: theme.colors.error },
  priceInputOk: { color: theme.colors.primary },
  priceLine: {
    width: 200, height: 2, borderRadius: 1,
    backgroundColor: theme.colors.border,
    marginTop: 4, marginBottom: 10,
  },
  priceLineError: { backgroundColor: theme.colors.error },
  priceLineOk: { backgroundColor: theme.colors.primary },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { ...theme.typography.caption, color: theme.colors.error, fontSize: 13 },
  priceHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },

  // ── SECCIONES ───────────────────────────────────────────────────────────────
  sectionBlock: { marginBottom: theme.spacing.l },
  sectionLabel: {
    ...theme.typography.label,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.s,
  },

  // ── CATEGORÍAS ──────────────────────────────────────────────────────────────
  categoryRow: { flexDirection: 'row', gap: 8 },
  categoryChip: {
    flex: 1, alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceHigh,
    gap: 5,
  },
  chipCheck: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 1.5, borderColor: theme.colors.border,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-end',
  },
  chipLabel: {
    ...theme.typography.caption,
    fontSize: 12, fontWeight: '600',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  chipPrice: {
    fontSize: 11, fontWeight: '700',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  loadingCats: { flexDirection: 'row', flex: 1, gap: 8 },
  categoryChipSkeleton: {
    flex: 1, height: 90, borderRadius: theme.borderRadius.m,
    backgroundColor: theme.colors.surfaceHigh, opacity: 0.5,
  },

  // ── PAGO ────────────────────────────────────────────────────────────────────
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.m,
    padding: theme.spacing.m,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  paymentLabel: {
    ...theme.typography.body, flex: 1,
    fontWeight: '600',
  },

  // ── TRIP INFO ────────────────────────────────────────────────────────────────
  tripInfoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginBottom: theme.spacing.m,
    paddingVertical: theme.spacing.s,
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  tripInfoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tripInfoText: {
    ...theme.typography.caption, color: theme.colors.textSecondary,
    fontSize: 12, fontWeight: '600',
  },
  tripInfoDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: theme.colors.border,
  },

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: theme.spacing.l,
    paddingTop: theme.spacing.m,
    borderTopWidth: 1, borderColor: theme.colors.border,
  },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16, borderRadius: theme.borderRadius.pill,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: theme.colors.surfaceHigh,
    shadowOpacity: 0, elevation: 0,
  },
  confirmBtnText: {
    ...theme.typography.button, fontSize: 17,
  },
});
