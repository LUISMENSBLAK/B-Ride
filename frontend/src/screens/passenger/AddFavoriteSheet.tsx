import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, FlatList, Alert,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import AddressAutocomplete, { PlaceResult } from '../../components/AddressAutocomplete';

const EMOJIS = ['🏠', '💼', '⭐', '🏋️', '🍽️', '🏥', '🎓', '🛒', '❤️'];
const FAV_STORAGE_KEY = 'user_favorites';

export interface Favorite {
  id: string;
  name: string;
  address: string;
  emoji: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
}

interface AddFavoriteSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (fav: Favorite) => void;
  userLat?: number;
  userLng?: number;
}

export async function loadFavorites(): Promise<Favorite[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveFavorite(fav: Favorite): Promise<Favorite[]> {
  const existing = await loadFavorites();
  const updated = [...existing, fav];
  await AsyncStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function deleteFavorite(id: string): Promise<Favorite[]> {
  const existing = await loadFavorites();
  const updated = existing.filter(f => f.id !== id);
  await AsyncStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export default function AddFavoriteSheet({
  visible, onClose, onSaved, userLat, userLng,
}: AddFavoriteSheetProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');

  const reset = useCallback(() => {
    setStep(1);
    setSelectedPlace(null);
    setName('');
    setEmoji('⭐');
  }, []);

  React.useEffect(() => {
    if (visible) {
      reset();
      sheetRef.current?.snapToIndex(0);
    } else {
      sheetRef.current?.close();
    }
  }, [visible]);

  const handleSave = async () => {
    if (!selectedPlace || !name.trim()) return;
    const fav: Favorite = {
      id: uuidv4(),
      name: name.trim(),
      address: selectedPlace.displayName,
      emoji,
      placeId: selectedPlace.placeId,
      latitude: selectedPlace.latitude,
      longitude: selectedPlace.longitude,
    };
    await saveFavorite(fav);
    onSaved(fav);
    onClose();
  };

  const canSave = !!selectedPlace && name.trim().length > 0;

  return (
    <BottomSheet
      ref={sheetRef}
      index={visible ? 0 : -1}
      snapPoints={['75%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={ss.sheetBg}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.20)', width: 36, height: 4 }}
    >
      <BottomSheetScrollView
        contentContainerStyle={[ss.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={ss.header}>
          <Text style={ss.title}>Guardar lugar favorito</Text>
          <TouchableOpacity style={ss.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={16} color="#FFF" />
          </TouchableOpacity>
        </View>

        {step === 1 ? (
          <>
            <Text style={ss.stepLabel}>¿A dónde quieres ir?</Text>
            <View style={{ marginTop: 8, minHeight: 300 }}>
              <AddressAutocomplete
                placeholder="Busca una dirección..."
                onSelect={(place) => {
                  setSelectedPlace(place);
                  setStep(2);
                }}
                userLat={userLat}
                userLng={userLng}
              />
            </View>
          </>
        ) : (
          <>
            {/* Selected address preview */}
            <View style={ss.addressPreview}>
              <Ionicons name="location" size={16} color="#F5C518" />
              <Text style={ss.addressPreviewText} numberOfLines={2}>
                {selectedPlace?.displayName}
              </Text>
              <TouchableOpacity onPress={() => setStep(1)}>
                <Text style={ss.changeText}>Cambiar</Text>
              </TouchableOpacity>
            </View>

            {/* Nombre */}
            <Text style={ss.fieldLabel}>¿Cómo quieres llamarlo?</Text>
            <TextInput
              style={ss.nameInput}
              placeholder="Ej: Casa, Gym, Trabajo..."
              placeholderTextColor="rgba(255,255,255,0.30)"
              value={name}
              onChangeText={setName}
              maxLength={30}
              selectionColor="#F5C518"
            />

            {/* Emoji selector */}
            <Text style={ss.fieldLabel}>Elige un ícono</Text>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={EMOJIS}
              keyExtractor={e => e}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
              renderItem={({ item }) => {
                const isSel = emoji === item;
                return (
                  <TouchableOpacity
                    style={[ss.emojiChip, isSel && ss.emojiChipSel]}
                    onPress={() => setEmoji(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={ss.emojiText}>{item}</Text>
                  </TouchableOpacity>
                );
              }}
            />

            {/* CTA */}
            <TouchableOpacity
              style={[ss.saveBtn, !canSave && ss.saveBtnDisabled]}
              disabled={!canSave}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={[ss.saveBtnText, !canSave && ss.saveBtnTextDisabled]}>
                Guardar lugar
              </Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const ss = StyleSheet.create({
  sheetBg: { backgroundColor: 'rgba(13,5,32,0.97)' },
  content: { paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.50)',
    marginBottom: 8,
  },
  addressPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
    padding: 14,
    gap: 10,
    marginBottom: 20,
  },
  addressPreviewText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 19,
  },
  changeText: {
    fontSize: 13,
    color: '#F5C518',
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.50)',
    marginBottom: 8,
    marginTop: 16,
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.40)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
  },
  emojiChip: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  emojiChipSel: {
    backgroundColor: 'rgba(245,197,24,0.15)',
    borderColor: '#F5C518',
  },
  emojiText: { fontSize: 22 },
  saveBtn: {
    marginTop: 28,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#F5C518',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C518',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  saveBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    shadowOpacity: 0,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D0520',
  },
  saveBtnTextDisabled: {
    color: 'rgba(255,255,255,0.30)',
  },
});
