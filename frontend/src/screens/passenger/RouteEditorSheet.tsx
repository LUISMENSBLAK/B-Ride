/**
 * RouteEditorSheet — B-Ride
 * Modal fullscreen para editar origen y/o destino del viaje.
 * Usa TextInput nativo (no BottomSheetTextInput) porque opera
 * fuera de cualquier contexto BottomSheet.
 *
 * FIX: No early-return on !visible — el Modal controla su propia
 * visibilidad. Un early return destruiría estado y animaciones.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, ActivityIndicator, Keyboard,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RoutePlace {
  displayName: string;
  latitude: number;
  longitude: number;
}

export interface RouteEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  initialOriginAddress?: string;
  initialDestAddress?: string;
  initialActiveField?: 'origin' | 'dest';
  userLat?: number;
  userLng?: number;
  onConfirm: (result: { origin?: RoutePlace; dest?: RoutePlace }) => void;
}

// ── Google Places helpers ─────────────────────────────────────────────────────
const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';
const CACHE_TTL  = 5 * 60_000;
const cache      = new Map<string, { results: any[]; ts: number }>();

async function searchPlaces(q: string, lat?: number, lng?: number) {
  if (!q || q.trim().length < 3) return [];
  const key = `${q.trim().toLowerCase()}_${lat}_${lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.results;
  try {
    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&language=es&key=${GOOGLE_KEY}`;
    if (lat !== undefined && lng !== undefined) url += `&location=${lat},${lng}&radius=50000`;
    const res  = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.predictions) return [];
    const results = (data.predictions as any[]).slice(0, 6).map((p: any) => ({
      displayName: p.description,
      placeId: p.place_id,
      latitude: 0,
      longitude: 0,
    }));
    if (cache.size >= 50) { const k = cache.keys().next().value; if (k) cache.delete(k); }
    cache.set(key, { results, ts: Date.now() });
    return results;
  } catch { return []; }
}

async function fetchCoords(placeId: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_KEY}`;
    const data = await (await fetch(url)).json();
    if (data.result?.geometry?.location) {
      return { latitude: data.result.geometry.location.lat, longitude: data.result.geometry.location.lng };
    }
    return null;
  } catch { return null; }
}

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

// ── Inner content (needs insets from SafeAreaProvider) ────────────────────────
function RouteEditorContent({
  onClose, activeField, setActiveField, originText, destText,
  handleSwap, searchQuery, handleChangeText, loading,
  setSearchQuery, setResults, results, handleSelectResult,
  animatedStyle, inputRef,
}: any) {
  const insets     = useSafeAreaInsets();
  const activeColor = activeField === 'origin' ? '#3D8EF0' : '#F5C518';
  const placeholder = activeField === 'origin' ? 'Busca tu punto de recogida…' : '¿A dónde te llevamos?';

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Edita tu ruta</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* ROUTE CARD */}
      <View style={styles.routeCard}>
        {/* Origen */}
        <TouchableOpacity
          onPress={() => setActiveField('origin')}
          style={[styles.routeRow, styles.routeRowBorder, activeField === 'origin' && styles.routeRowActiveOrigin]}
          activeOpacity={0.85}
        >
          <View style={styles.dotOrigin} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>De</Text>
            <Text style={[styles.fieldValue, activeField === 'origin' && { color: '#3D8EF0' }]} numberOfLines={1}>
              {originText || 'Mi ubicación actual'}
            </Text>
          </View>
          {activeField === 'origin' && <Ionicons name="pencil" size={14} color="#3D8EF0" />}
        </TouchableOpacity>

        {/* Línea conectora */}
        <View style={styles.connector} />

        {/* Destino */}
        <TouchableOpacity
          onPress={() => setActiveField('dest')}
          style={[styles.routeRow, activeField === 'dest' && styles.routeRowActiveDest]}
          activeOpacity={0.85}
        >
          <View style={styles.dotDest} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>A</Text>
            <Text style={[styles.fieldValue, activeField === 'dest' && { color: '#F5C518' }]} numberOfLines={1}>
              {destText || 'Elige un destino'}
            </Text>
          </View>
          {activeField === 'dest' && <Ionicons name="pencil" size={14} color="#F5C518" />}
        </TouchableOpacity>
      </View>

      {/* SWAP */}
      <TouchableOpacity onPress={handleSwap} style={styles.swapBtn} activeOpacity={0.75}>
        <Ionicons name="swap-vertical" size={14} color="rgba(255,255,255,0.60)" />
        <Text style={styles.swapText}>Intercambiar</Text>
      </TouchableOpacity>

      {/* SEARCH INPUT */}
      <View style={[styles.searchRow, { borderColor: activeColor + '44' }]}>
        <Ionicons
          name={activeField === 'origin' ? 'radio-button-on' : 'location-outline'}
          size={16} color={activeColor}
          style={{ marginRight: 8 }}
        />
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, { color: '#FFFFFF' }]}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={searchQuery}
          onChangeText={handleChangeText}
          returnKeyType="search"
          autoCorrect={false}
          autoComplete="off"
          autoFocus
        />
        {loading
          ? <ActivityIndicator size="small" color={activeColor} style={{ marginLeft: 8 }} />
          : searchQuery.length > 0
            ? <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            : null}
      </View>

      {/* RESULTS */}
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        style={styles.resultList}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={[styles.resultItem, index < results.length - 1 && styles.resultBorder]}
            onPress={() => handleSelectResult(item)}
            activeOpacity={0.75}
          >
            <View style={[styles.resultDot, { backgroundColor: activeColor }]} />
            <Text style={styles.resultText} numberOfLines={2}>{item.displayName}</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.25)" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !loading && searchQuery.length >= 3
            ? <Text style={styles.emptyHint}>Sin resultados para "{searchQuery}"</Text>
            : null
        }
      />
    </Animated.View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RouteEditorSheet({
  visible, onClose,
  initialOriginAddress, initialDestAddress,
  initialActiveField = 'dest',
  userLat, userLng,
  onConfirm,
}: RouteEditorSheetProps) {
  const [activeField, setActiveField] = useState<'origin' | 'dest'>(initialActiveField);
  const [originText, setOriginText]   = useState(initialOriginAddress ?? '');
  const [destText,   setDestText]     = useState(initialDestAddress   ?? '');
  const [originPlace, setOriginPlace] = useState<(RoutePlace & { placeId?: string }) | null>(null);
  const [destPlace,   setDestPlace]   = useState<(RoutePlace & { placeId?: string }) | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebounce(searchQuery, 450);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const searchIdRef = useRef(0);
  const inputRef    = useRef<TextInput>(null);

  // Slide-up animation
  const translateY = useSharedValue(80);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setActiveField(initialActiveField);
      setOriginText(initialOriginAddress ?? '');
      setDestText(initialDestAddress ?? '');
      setSearchQuery('');
      setResults([]);
      setOriginPlace(null);
      setDestPlace(null);
      translateY.value = withSpring(0, { damping: 22, stiffness: 250 });
      opacity.value    = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(80, { duration: 180 });
      opacity.value    = withTiming(0, { duration: 150 });
    }
  }, [visible]);

  // Sync search query when switching field
  useEffect(() => {
    setSearchQuery(activeField === 'origin' ? originText : destText);
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [activeField]);

  // Search execution
  useEffect(() => {
    const id = ++searchIdRef.current;
    const q  = debouncedQuery.trim();
    if (q.length < 3) { setResults([]); setLoading(false); return; }
    setLoading(true);
    searchPlaces(q, userLat, userLng).then(items => {
      if (id !== searchIdRef.current) return;
      setResults(items);
      setLoading(false);
    });
  }, [debouncedQuery, userLat, userLng]);

  const handleChangeText = useCallback((text: string) => {
    setSearchQuery(text);
    if (activeField === 'origin') setOriginText(text);
    else setDestText(text);
  }, [activeField]);

  const handleSelectResult = useCallback(async (item: any) => {
    Keyboard.dismiss();
    setResults([]);
    setLoading(true);
    const coords = item.placeId ? await fetchCoords(item.placeId) : null;
    setLoading(false);
    const place: RoutePlace = {
      displayName: item.displayName,
      latitude:  coords?.latitude  ?? 0,
      longitude: coords?.longitude ?? 0,
    };
    if (activeField === 'origin') {
      setOriginText(place.displayName);
      setOriginPlace(place);
      if (destPlace) { onConfirm({ origin: place, dest: destPlace }); onClose(); }
      else setActiveField('dest');
    } else {
      setDestText(place.displayName);
      setDestPlace(place);
      onConfirm({ origin: originPlace ?? undefined, dest: place });
      onClose();
    }
  }, [activeField, destPlace, originPlace, onConfirm, onClose]);

  const handleSwap = useCallback(() => {
    const tmpT = originText; const tmpP = originPlace;
    setOriginText(destText);   setOriginPlace(destPlace);
    setDestText(tmpT);         setDestPlace(tmpP);
    setSearchQuery(activeField === 'origin' ? destText : originText);
    setResults([]);
  }, [originText, destText, originPlace, destPlace, activeField]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  // NOTE: No early return on !visible — Modal handles its own visibility.
  // An early return would destroy state + break animations.
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/*
        SafeAreaProvider wraps the content because Modal creates a new
        React root where the parent SafeAreaProvider is not inherited.
      */}
      <SafeAreaProvider>
        <RouteEditorContent
          onClose={onClose}
          activeField={activeField}
          setActiveField={setActiveField}
          originText={originText}
          destText={destText}
          handleSwap={handleSwap}
          searchQuery={searchQuery}
          handleChangeText={handleChangeText}
          loading={loading}
          setSearchQuery={setSearchQuery}
          setResults={setResults}
          results={results}
          handleSelectResult={handleSelectResult}
          animatedStyle={animatedStyle}
          inputRef={inputRef}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0520',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  routeCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  routeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  routeRowActiveOrigin: { backgroundColor: 'rgba(61,142,240,0.08)' },
  routeRowActiveDest:   { backgroundColor: 'rgba(245,197,24,0.06)' },
  dotOrigin: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#3D8EF0',
    borderWidth: 2.5, borderColor: 'rgba(61,142,240,0.35)',
    marginRight: 14,
  },
  dotDest: {
    width: 12, height: 12, borderRadius: 2,
    backgroundColor: '#F5C518',
    marginRight: 14,
  },
  connector: {
    position: 'absolute',
    left: 21, top: 46,
    width: 1, height: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 10, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 2,
  },
  fieldValue: {
    color: '#FFFFFF',
    fontSize: 15, fontWeight: '600',
  },
  swapBtn: {
    alignSelf: 'flex-end',
    marginRight: 20, marginTop: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  swapText: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 12, fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  resultList: {
    marginTop: 12,
    marginHorizontal: 20,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  resultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  resultDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  resultText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
  },
});
