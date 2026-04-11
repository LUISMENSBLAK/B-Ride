import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Platform, ActivityIndicator, SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../store/authStore';
import client from '../../api/client';

type Step = 'VEHICLE' | 'DOCUMENTS' | 'PAYMENT';

/**
 * CORRECCIÓN 8: V2 Onboarding de conductor en 3 pasos:
 * 1. Vehículo
 * 2. Documentos (Carnet)
 * 3. Stripe Connect
 */
export default function DriverOnboardingScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { user, checkAuth } = useAuthStore();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [step, setStep] = useState<Step>('VEHICLE');
  const [loading, setLoading] = useState(false);

  // Vehicle
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('SEDAN');
  const [capacity, setCapacity] = useState('4');

  // Documents
  const [licenseUri, setLicenseUri] = useState<string | null>(null);

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
      if (step === 'VEHICLE') {
        if (!make || !model || !plate || !color || !year) {
          Alert.alert('Error', 'Todos los campos del vehículo son obligatorios');
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
          Alert.alert('Error', 'La foto del carnet de conducir es obligatoria');
          return;
        }
        // En producción aquí se subiría a Cloudinary (B2)
        await client.put('/auth/profile', {
          approvalStatus: 'UNDER_REVIEW',
        });
        setStep('PAYMENT');
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setLoading(true);
    try {
      const res = await client.post('/payment/onboard');
      if (res.data.success && res.data.url) {
        // Abre el navegador del sistema para el onboarding de Stripe
        Linking.openURL(res.data.url);
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'Error conectando con Stripe');
    } finally {
      setLoading(false);
    }
  };

  const renderVehicle = () => (
    <View>
      <Text style={styles.stepTitle}>🚗 Datos del vehículo</Text>
      <TextInput style={styles.input} placeholder="Marca (ej: Toyota)" placeholderTextColor={theme.colors.inputPlaceholder} value={make} onChangeText={setMake} returnKeyType="next" />
      <TextInput style={styles.input} placeholder="Modelo (ej: Corolla)" placeholderTextColor={theme.colors.inputPlaceholder} value={model} onChangeText={setModel} returnKeyType="next" />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Año" placeholderTextColor={theme.colors.inputPlaceholder} value={year} onChangeText={setYear} keyboardType="numeric" returnKeyType="next" />
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Color" placeholderTextColor={theme.colors.inputPlaceholder} value={color} onChangeText={setColor} returnKeyType="next" />
      </View>
      <TextInput style={styles.input} placeholder="Matrícula (ej: ABC-1234)" placeholderTextColor={theme.colors.inputPlaceholder} value={plate} onChangeText={setPlate} autoCapitalize="characters" returnKeyType="next" />
      
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
      <Text style={styles.bodyText}>Necesitamos una foto legible de tu carnet de conducir para verificarte.</Text>
      <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage(setLicenseUri)}>
        <Text style={styles.uploadIcon}>{licenseUri ? '✅' : '📷'}</Text>
        <Text style={styles.uploadText}>{licenseUri ? 'Carnet subido (tocar para cambiar)' : 'Tocar para subir foto del carnet'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderPayment = () => (
    <View>
      <Text style={styles.stepTitle}>💳 Recibe tus pagos</Text>
      <Text style={styles.bodyText}>
        B-Ride utiliza Stripe para procesar los pagos y enviarte tus ganancias de forma segura. 
        Conecta tu cuenta para poder recibir viajes.
      </Text>
      <TouchableOpacity style={styles.stripeBtn} onPress={handleConnectStripe} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : (
          <Text style={styles.stripeBtnText}>Conectar cuenta con Stripe</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.refreshBtn} onPress={checkAuth} disabled={loading}>
        <Text style={styles.refreshBtnText}>Ya conecté mi cuenta (Actualizar estado)</Text>
      </TouchableOpacity>
    </View>
  );

  const stepIndex = { VEHICLE: 0, DOCUMENTS: 1, PAYMENT: 2 }[step];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]} />
          ))}
        </View>

        <Text style={styles.header}>Registro de conductor</Text>
        <Text style={styles.stepLabel}>Paso {stepIndex + 1} de 3</Text>

        {step === 'VEHICLE' && renderVehicle()}
        {step === 'DOCUMENTS' && renderDocuments()}
        {step === 'PAYMENT' && renderPayment()}

        {step !== 'PAYMENT' && (
          <TouchableOpacity style={[styles.nextBtn, loading && { opacity: 0.5 }]} onPress={submitStep} disabled={loading}>
            {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : (
              <Text style={styles.nextBtnText}>Siguiente</Text>
            )}
          </TouchableOpacity>
        )}

        {step !== 'VEHICLE' && step !== 'PAYMENT' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep('VEHICLE')} disabled={loading}>
            <Text style={styles.backBtnText}>← Atrás</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 20 : 40, paddingBottom: 60 },
  header: { ...theme.typography.header, fontSize: 24, marginBottom: 4 },
  stepLabel: { ...theme.typography.bodyMuted, marginBottom: 24 },
  stepTitle: { ...theme.typography.title, fontSize: 18, marginBottom: 16 },
  bodyText: { ...theme.typography.body, color: theme.colors.textMuted, marginBottom: 20, lineHeight: 22 },
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
  uploadBox: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: theme.colors.primary,
    borderRadius: 16, padding: 32, alignItems: 'center', backgroundColor: theme.colors.primaryLight + '20',
  },
  uploadIcon: { fontSize: 48, marginBottom: 16 },
  uploadText: { ...theme.typography.body, textAlign: 'center', color: theme.colors.primary, fontWeight: '600' },
  stripeBtn: {
    backgroundColor: '#6772E5', // Stripe blurple
    padding: 16, borderRadius: 30, alignItems: 'center', marginTop: 12,
  },
  stripeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  refreshBtn: {
    backgroundColor: theme.colors.surface, padding: 16, borderRadius: 30,
    alignItems: 'center', marginTop: 16, borderWidth: 1, borderColor: theme.colors.border,
  },
  refreshBtnText: { ...theme.typography.body, fontWeight: '600', color: theme.colors.text },
});
