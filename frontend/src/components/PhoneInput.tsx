import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { Ionicons } from '@expo/vector-icons';

interface Country {
  name: string;
  flag: string;
  code: string;
  dial: string;
}

const COUNTRIES: Country[] = [
  { name: 'México', flag: '🇲🇽', code: 'MX', dial: '+52' },
  { name: 'Estados Unidos', flag: '🇺🇸', code: 'US', dial: '+1' },
  { name: 'España', flag: '🇪🇸', code: 'ES', dial: '+34' },
  { name: 'Colombia', flag: '🇨🇴', code: 'CO', dial: '+57' },
  { name: 'Argentina', flag: '🇦🇷', code: 'AR', dial: '+54' },
  { name: 'Chile', flag: '🇨🇱', code: 'CL', dial: '+56' },
  { name: 'Perú', flag: '🇵🇪', code: 'PE', dial: '+51' },
  { name: 'Ecuador', flag: '🇪🇨', code: 'EC', dial: '+593' },
  { name: 'Venezuela', flag: '🇻🇪', code: 'VE', dial: '+58' },
  { name: 'Guatemala', flag: '🇬🇹', code: 'GT', dial: '+502' },
  { name: 'Cuba', flag: '🇨🇺', code: 'CU', dial: '+53' },
  { name: 'Bolivia', flag: '🇧🇴', code: 'BO', dial: '+591' },
  { name: 'Honduras', flag: '🇭🇳', code: 'HN', dial: '+504' },
  { name: 'Paraguay', flag: '🇵🇾', code: 'PY', dial: '+595' },
  { name: 'El Salvador', flag: '🇸🇻', code: 'SV', dial: '+503' },
  { name: 'Nicaragua', flag: '🇳🇮', code: 'NI', dial: '+505' },
  { name: 'Costa Rica', flag: '🇨🇷', code: 'CR', dial: '+506' },
  { name: 'Panamá', flag: '🇵🇦', code: 'PA', dial: '+507' },
  { name: 'Uruguay', flag: '🇺🇾', code: 'UY', dial: '+598' },
  { name: 'Puerto Rico', flag: '🇵🇷', code: 'PR', dial: '+1' },
  { name: 'República Dominicana', flag: '🇩🇴', code: 'DO', dial: '+1' },
  { name: 'Brasil', flag: '🇧🇷', code: 'BR', dial: '+55' },
  { name: 'Canadá', flag: '🇨🇦', code: 'CA', dial: '+1' },
  { name: 'Reino Unido', flag: '🇬🇧', code: 'GB', dial: '+44' },
  { name: 'Francia', flag: '🇫🇷', code: 'FR', dial: '+33' },
  { name: 'Alemania', flag: '🇩🇪', code: 'DE', dial: '+49' },
  { name: 'Italia', flag: '🇮🇹', code: 'IT', dial: '+39' },
  { name: 'Portugal', flag: '🇵🇹', code: 'PT', dial: '+351' },
  { name: 'Japón', flag: '🇯🇵', code: 'JP', dial: '+81' },
  { name: 'China', flag: '🇨🇳', code: 'CN', dial: '+86' },
  { name: 'India', flag: '🇮🇳', code: 'IN', dial: '+91' },
  { name: 'Australia', flag: '🇦🇺', code: 'AU', dial: '+61' },
];

interface PhoneInputProps {
  value: string;
  onChangePhone: (fullNumber: string) => void;
  placeholder?: string;
}

export default function PhoneInput({ value, onChangePhone, placeholder = 'Número de teléfono' }: PhoneInputProps) {
  const theme = useAppTheme();
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [localNumber, setLocalNumber] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleNumberChange = useCallback((text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setLocalNumber(digits);
    onChangePhone(digits ? `${selectedCountry.dial}${digits}` : '');
  }, [selectedCountry, onChangePhone]);

  const handleCountrySelect = useCallback((country: Country) => {
    setSelectedCountry(country);
    setModalVisible(false);
    setSearch('');
    if (localNumber) {
      onChangePhone(`${country.dial}${localNumber}`);
    }
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [localNumber, onChangePhone]);

  const filteredCountries = search
    ? COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.dial.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  return (
    <>
      <View style={[styles.container, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
        {/* Country selector */}
        <TouchableOpacity
          style={[styles.countryBtn, { borderRightColor: theme.colors.border }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <Text style={[styles.dialCode, { color: theme.colors.textSecondary }]}>{selectedCountry.dial}</Text>
          <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} style={{ marginLeft: 2 }} />
        </TouchableOpacity>

        {/* Number input */}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inputPlaceholder}
          value={localNumber}
          onChangeText={handleNumberChange}
          keyboardType="phone-pad"
          maxLength={15}
          returnKeyType="done"
        />
      </View>

      {/* Country picker modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => { setModalVisible(false); setSearch(''); }} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              {/* Drag handle */}
              <View style={styles.dragHandleRow}>
                <View style={[styles.dragHandle, { backgroundColor: theme.colors.textMuted }]} />
              </View>

              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Seleccionar país</Text>
                <TouchableOpacity
                  onPress={() => { setModalVisible(false); setSearch(''); }}
                  style={[styles.closeBtn, { backgroundColor: theme.colors.primaryLight }]}
                >
                  <Ionicons name="close" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={[styles.searchBox, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <Ionicons name="search" size={16} color={theme.colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Buscar país o código..."
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Country list */}
              <FlatList
                data={filteredCountries}
                keyExtractor={item => `${item.code}_${item.dial}`}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isSelected = item.code === selectedCountry.code && item.dial === selectedCountry.dial;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.countryRow,
                        { borderBottomColor: theme.colors.border },
                        isSelected && { backgroundColor: theme.colors.primaryLight }
                      ]}
                      onPress={() => handleCountrySelect(item)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.rowFlag}>{item.flag}</Text>
                      <View style={styles.rowInfo}>
                        <Text style={[styles.rowName, { color: theme.colors.text }]}>{item.name}</Text>
                        <Text style={[styles.rowCode, { color: theme.colors.textMuted }]}>{item.code}</Text>
                      </View>
                      <Text style={[styles.rowDial, { color: isSelected ? theme.colors.primary : theme.colors.textSecondary }]}>{item.dial}</Text>
                      {isSelected && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 56,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRightWidth: 1,
    gap: 6,
  },
  flag: { fontSize: 22, marginTop: Platform.OS === 'ios' ? -2 : 0 },
  dialCode: { fontSize: 15, fontWeight: '600' },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
    letterSpacing: 0.5,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalKeyboard: { justifyContent: 'flex-end' },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    opacity: 0.4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
  },
  rowFlag: { fontSize: 26, marginRight: 14 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '500' },
  rowCode: { fontSize: 12, marginTop: 1 },
  rowDial: { fontSize: 15, fontWeight: '600' },
});
