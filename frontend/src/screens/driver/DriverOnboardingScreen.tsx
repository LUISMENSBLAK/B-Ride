import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Platform, ActivityIndicator, SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../store/authStore';
import client from '../../api/client';

type Step = 'PERSONAL' | 'VEHICLE' | 'DOCUMENTS' | 'WAITING';

/**
 * V2: Onboarding de conductor en 4 pasos.
 * Restricción: conductor no puede ponerse online si no está APPROVED.
 */
export default function DriverOnboardingScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [step, setStep] = useState<Step>('PERSONAL');
  const [loading, setLoading] = useState(false);

  // Personal
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');

  // Vehicle
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('SEDAN');
  const [capacity, setCapacity] = useState('4');

  // Documents (URIs)
  const [licenseUri, setLicenseUri] = useState<string | null>(null);
  const [insuranceUri, setInsuranceUri] = useState<string | null>(null);
  const [registrationUri, setRegistrationUri] = useState<string | null>(null);
  const [vehiclePhotoUri, setVehiclePhotoUri] = useState<string | null>(null);

  const pickImage = async (setter: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const submitStep = async () => {
    setLoading(true);
    try {
      if (step === 'PERSONAL') {
        if (!name || !phone) {
          Alert.alert('Error', 'Nombre y teléfono son obligatorios');
          return;
        }
        await client.put('/auth/profile', { name, phoneNumber: phone });
        setStep('VEHICLE');
      } else if (step === 'VEHICLE') {
        if (!make || !model || !plate) {
          Alert.alert('Error', 'Marca, modelo y placa son obligatorios');
          return;
        }
        await client.put('/auth/profile', {
          vehicle: {
            make, model,
            year: parseInt(year) || null,
            color, plate, type: vehicleType,
            capacity: parseInt(capacity) || 4,
          }
        });
        setStep('DOCUMENTS');
      } else if (step === 'DOCUMENTS') {
        if (!licenseUri) {
          Alert.alert('Error', 'La licencia es obligatoria');
          return;
        }
        // En producción usar FormData + Cloudinary (B2)
        // Por ahora marca como subidos
        await client.put('/auth/profile', {
          approvalStatus: 'UNDER_REVIEW',
        });
        setStep('WAITING');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const renderPersonal = () => (
    <View>
      <Text style={styles.stepTitle}>📋 Datos personales</Text>
      <TextInput style={styles.input} placeholder="Nombre completo" placeholderTextColor={theme.colors.inputPlaceholder} value={name} onChangeText={setName} returnKeyType="next" />
      <TextInput style={styles.input} placeholder="Teléfono" placeholderTextColor={theme.colors.inputPlaceholder} value={phone} onChangeText={setPhone} keyboardType="phone-pad" returnKeyType="done" />
    </View>
  );

  const renderVehicle = () => (
    <View>
      <Text style={styles.stepTitle}>🚗 Datos del vehículo</Text>
      <TextInput style={styles.input} placeholder="Marca (ej: Toyota)" placeholderTextColor={theme.colors.inputPlaceholder} value={make} onChangeText={setMake} returnKeyType="next" />
      <TextInput style={styles.input} placeholder="Modelo (ej: Corolla)" placeholderTextColor={theme.colors.inputPlaceholder} value={model} onChangeText={setModel} returnKeyType="next" />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Año" placeholderTextColor={theme.colors.inputPlaceholder} value={year} onChangeText={setYear} keyboardType="numeric" />
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Color" placeholderTextColor={theme.colors.inputPlaceholder} value={color} onChangeText={setColor} />
      </View>
      <TextInput style={styles.input} placeholder="Placa (ej: ABC-1234)" placeholderTextColor={theme.colors.inputPlaceholder} value={plate} onChangeText={setPlate} autoCapitalize="characters" returnKeyType="next" />
      <TextInput style={styles.input} placeholder="Capacidad de pasajeros" placeholderTextColor={theme.colors.inputPlaceholder} value={capacity} onChangeText={setCapacity} keyboardType="numeric" returnKeyType="done" />

      <Text style={styles.label}>Tipo de vehículo:</Text>
      <View style={styles.typeRow}>
        {['SEDAN', 'SUV', 'VAN', 'MOTO'].map(vt => (
          <TouchableOpacity key={vt} style={[styles.typeBtn, vehicleType === vt && styles.typeBtnActive]} onPress={() => setVehicleType(vt)}>
            <Text style={[styles.typeText, vehicleType === vt && styles.typeTextActive]}>{vt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderDocuments = () => (
    <View>
      <Text style={styles.stepTitle}>📄 Documentos</Text>
      <DocUploadRow label="Licencia de conducir *" uri={licenseUri} onPress={() => pickImage(setLicenseUri)} theme={theme} />
      <DocUploadRow label="Seguro del vehículo" uri={insuranceUri} onPress={() => pickImage(setInsuranceUri)} theme={theme} />
      <DocUploadRow label="Registro vehicular" uri={registrationUri} onPress={() => pickImage(setRegistrationUri)} theme={theme} />
      <DocUploadRow label="Foto del vehículo" uri={vehiclePhotoUri} onPress={() => pickImage(setVehiclePhotoUri)} theme={theme} />
    </View>
  );

  const renderWaiting = () => (
    <View style={styles.waitingContainer}>
      <Text style={styles.waitingEmoji}>⏳</Text>
      <Text style={styles.waitingTitle}>Documentos en revisión</Text>
      <Text style={styles.waitingSubtitle}>
        Tu solicitud está siendo revisada por nuestro equipo. Te notificaremos cuando sea aprobada.
      </Text>
    </View>
  );

  const stepIndex = { PERSONAL: 0, VEHICLE: 1, DOCUMENTS: 2, WAITING: 3 }[step];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]} />
          ))}
        </View>

        <Text style={styles.header}>Registro de conductor</Text>
        <Text style={styles.stepLabel}>Paso {stepIndex + 1} de 4</Text>

        {step === 'PERSONAL' && renderPersonal()}
        {step === 'VEHICLE' && renderVehicle()}
        {step === 'DOCUMENTS' && renderDocuments()}
        {step === 'WAITING' && renderWaiting()}

        {step !== 'WAITING' && (
          <TouchableOpacity style={[styles.nextBtn, loading && { opacity: 0.5 }]} onPress={submitStep} disabled={loading}>
            {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : (
              <Text style={styles.nextBtnText}>
                {step === 'DOCUMENTS' ? 'Enviar para revisión' : 'Siguiente'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {step !== 'PERSONAL' && step !== 'WAITING' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => {
            if (step === 'VEHICLE') setStep('PERSONAL');
            if (step === 'DOCUMENTS') setStep('VEHICLE');
          }}>
            <Text style={styles.backBtnText}>← Atrás</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DocUploadRow({ label, uri, onPress, theme }: any) {
  return (
    <TouchableOpacity style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: theme.colors.background, padding: 14, borderRadius: 12,
      marginBottom: 10, borderWidth: 1, borderColor: theme.colors.border,
    }} onPress={onPress}>
      <Text style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>{label}</Text>
      <Text style={{ color: uri ? theme.colors.success : theme.colors.primary, fontWeight: '700', fontSize: 13 }}>
        {uri ? '✅ Subido' : '📎 Subir'}
      </Text>
    </TouchableOpacity>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 20 : 40, paddingBottom: 60 },
  header: { ...theme.typography.header, fontSize: 24, marginBottom: 4 },
  stepLabel: { ...theme.typography.bodyMuted, marginBottom: 24 },
  stepTitle: { ...theme.typography.title, fontSize: 18, marginBottom: 16 },
  input: {
    backgroundColor: theme.colors.surface, padding: 14, borderRadius: 12,
    marginBottom: 12, fontSize: 15, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
  label: { ...theme.typography.body, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', backgroundColor: theme.colors.surface },
  typeBtnActive: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  typeText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  typeTextActive: { color: theme.colors.primary },
  progressContainer: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  progressDotActive: { backgroundColor: theme.colors.primary },
  nextBtn: {
    backgroundColor: theme.colors.primary, padding: 16, borderRadius: 30,
    alignItems: 'center', marginTop: 24,
  },
  nextBtnText: { ...theme.typography.button },
  backBtn: { alignItems: 'center', marginTop: 16, padding: 12 },
  backBtnText: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 15 },
  waitingContainer: { alignItems: 'center', paddingVertical: 48 },
  waitingEmoji: { fontSize: 64, marginBottom: 16 },
  waitingTitle: { ...theme.typography.title, fontSize: 22, marginBottom: 12 },
  waitingSubtitle: { ...theme.typography.bodyMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 },
});
