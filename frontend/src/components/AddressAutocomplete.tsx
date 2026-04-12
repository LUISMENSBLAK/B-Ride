import { useAppTheme } from "../hooks/useAppTheme";
import React, { useState, useCallback, useRef, memo } from 'react';
import {
  View, TextInput, FlatList, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet, Keyboard,
} from 'react-native';
import * as Localization from 'expo-localization';

import useDebounce from '../hooks/useDebounce';

// El hook useDebounce ya existe en el proyecto — lo reutilizamos.
// Este componente NO crea un debounce propio para evitar duplicación.

export interface PlaceResult {
  displayName: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  placeholder?: string;
  onSelect: (place: PlaceResult) => void;
  /** Si ya hay una dirección seleccionada, se puede controlar externamente */
  value?: string;
  /** Location bias coordinates */
  userLat?: number;
  userLng?: number;
}

// Caché en memoria para consultas Nominatim — evita llamadas duplicadas en la sesión.
const queryCache = new Map<string, PlaceResult[]>();

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

async function searchGooglePlaces(query: string, userLat?: number, userLng?: number): Promise<PlaceResult[]> {
  if (!query || query.trim().length < 3) return [];

  const keyCache = query.trim().toLowerCase() + `_${userLat}_${userLng}`;
  if (queryCache.has(keyCache)) return queryCache.get(keyCache)!;

  try {
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_KEY}`;
    
    if (userLat !== undefined && userLng !== undefined) {
      url += `&location=${userLat},${userLng}&radius=50000`; // 50km radius
    }

    const res = await fetch(url);
    if (!res.ok) return [];
    
    const data = await res.json();
    if (!data.results) return [];

    const results: PlaceResult[] = data.results.slice(0, 5).map((item: any) => ({
      displayName: item.formatted_address || item.name,
      latitude: item.geometry.location.lat,
      longitude: item.geometry.location.lng,
    }));

    if (queryCache.size >= 50) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) queryCache.delete(firstKey);
    }
    queryCache.set(keyCache, results);
    return results;
  } catch (error) {
    console.error('Google Places search error:', error);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function AddressAutocomplete({ placeholder = 'Ingresa tu destino', onSelect, value, userLat, userLng }: AddressAutocompleteProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const [inputText, setInputText] = useState(value ?? '');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(false); // true = el usuario ya eligió, no mostrar dropdown

  // Debounce de 450ms — suficiente para no martillar Nominatim mientras el usuario escribe
  const debouncedQuery = useDebounce(inputText, 450);

  // Ref para cancelar búsquedas obsoletas (evita race conditions)
  const searchIdRef = useRef(0);

  // Dispara la búsqueda cuando el valor debounced cambia
  React.useEffect(() => {
    if (selected) return; // no buscar si ya hay selección vigente

    const id = ++searchIdRef.current;
    const query = debouncedQuery.trim();

    if (query.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    searchGooglePlaces(query, userLat, userLng).then((items) => {
      if (id !== searchIdRef.current) return; // respuesta obsoleta, ignorar
      setResults(items);
      setLoading(false);
    });
  }, [debouncedQuery, selected, userLat, userLng]);

  const handleChangeText = useCallback((text: string) => {

    setInputText(text);
    setSelected(false); // reset selección si el usuario vuelve a escribir
  }, []);

  const handleSelect = useCallback((place: PlaceResult) => {
    setInputText(place.displayName);
    setResults([]);
    setSelected(true);
    Keyboard.dismiss();
    onSelect(place);
  }, [onSelect]);

  const handleClear = useCallback(() => {
    setInputText('');
    setResults([]);
    setSelected(false);
  }, []);

  const showDropdown = !selected && results.length > 0 && !loading;

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
          value={inputText}
          onChangeText={handleChangeText}
          returnKeyType="search"
          autoCorrect={false}
          autoComplete="off"
        />
        {/* Indicador de carga / botón de limpiar */}
        {loading ? (
          <ActivityIndicator
            size="small"
            color={theme.colors.primary}
            style={styles.inputIcon}
          />
        ) : inputText.length > 0 ? (
          <TouchableOpacity onPress={handleClear} style={styles.inputIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Dropdown de resultados */}
      {showDropdown && (
        <View style={styles.dropdown}>
          <FlatList
            data={results}
            keyExtractor={(_, i) => String(i)}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={results.length > 3}
            style={{ maxHeight: 220 }}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.resultItem, index < results.length - 1 && styles.resultBorder]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.resultPin}>📍</Text>
                <Text style={styles.resultText} numberOfLines={2}>
                  {item.displayName}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const getStyles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  wrapper: {
    flex: 1,
    zIndex: 100, // Encima del mapa y del resto de la UI
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.m,
    paddingRight: 8,
  },
  input: {
    flex: 1,
    padding: 14,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputIcon: {
    padding: 6,
  },
  clearIcon: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: 'rgba(13,5,32,0.5)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 12,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  resultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  resultPin: {
    fontSize: 14,
    marginTop: 1,
  },
  resultText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
});

export default memo(AddressAutocomplete);
