import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';

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
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]); // México default
  const [localNumber, setLocalNumber] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleNumberChange = useCallback((text: string) => {
    // Only allow digits
    const digits = text.replace(/[^0-9]/g, '');
    setLocalNumber(digits);
    // E.164 format
    onChangePhone(digits ? `${selectedCountry.dial}${digits}` : '');
  }, [selectedCountry, onChangePhone]);

  const handleCountrySelect = useCallback((country: Country) => {
    setSelectedCountry(country);
    setModalVisible(false);
    setSearch('');
    // Update the full number with new country code
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
        {/* Country selector button */}
        <TouchableOpacity
          style={[styles.countryBtn, { borderRightColor: theme.colors.border }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.flag}>{selectedCountry.flag}</Text>
          <Text style={[styles.dialCode, { color: theme.colors.textSecondary }]}>{selectedCountry.dial}</Text>
          <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>▾</Text>
        </TouchableOpacity>

        {/* Phone number input */}
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
        <View style={[styles.modalOverlay]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
                <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Seleccionar país</Text>
                <TouchableOpacity onPress={() => { setModalVisible(false); setSearch(''); }}>
                  <Text style={[styles.modalClose, { color: theme.colors.primary }]}>Cerrar</Text>
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={[styles.searchBox, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={[styles.searchInput, { color: theme.colors.text }]}
                  placeholder="Buscar país..."
                  placeholderTextColor={theme.colors.inputPlaceholder}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
              </View>

              {/* Country list */}
              <FlatList
                data={filteredCountries}
                keyExtractor={item => item.code}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.countryRow,
                      { borderBottomColor: theme.colors.border },
                      item.code === selectedCountry.code && { backgroundColor: theme.colors.primaryLight }
                    ]}
                    onPress={() => handleCountrySelect(item)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.rowFlag}>{item.flag}</Text>
                    <Text style={[styles.rowName, { color: theme.colors.text }]}>{item.name}</Text>
                    <Text style={[styles.rowDial, { color: theme.colors.textMuted }]}>{item.dial}</Text>
                  </TouchableOpacity>
                )}
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
    overflow: 'hidden',
    height: 54,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRightWidth: 1,
    height: '100%',
    gap: 6,
  },
  flag: { fontSize: 22 },
  dialCode: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 10, marginLeft: 2 },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    height: '100%',
    letterSpacing: 0.5,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    maxHeight: '75%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalClose: { fontSize: 15, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15 },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  rowFlag: { fontSize: 24 },
  rowName: { flex: 1, fontSize: 15 },
  rowDial: { fontSize: 14, fontWeight: '500' },
});
