import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Platform, ActivityIndicator, SafeAreaView, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence,
  withTiming, withRepeat,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../../hooks/useAppTheme';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../store/authStore';
import client from '../../api/client';

type Step = 'PROFILE_PHOTO' | 'VEHICLE' | 'LICENSE' | 'REGISTRATION' | 'WAITING';

const STEPS: Step[] = ['PROFILE_PHOTO', 'VEHICLE', 'LICENSE', 'REGISTRATION', 'WAITING'];
const STEP_LABELS: Record<Step, string> = {
  PROFILE_PHOTO: 'Foto',
  VEHICLE: 'Vehículo',
  LICENSE: 'Licencia',
  REGISTRATION: 'Registro',
  WAITING: 'Revisión',
};
export default function DriverOnboardingScreen() {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { user, checkAuth } = useAuthStore();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  // Si ya tiene estado de revisión o está aprobado, bloqueamos al último paso
  const initialStep: Step = (user?.approvalStatus === 'UNDER_REVIEW' || user?.approvalStatus === 'APPROVED' || user?.driverApprovalStatus === 'UNDER_REVIEW') 
         ? 'WAITING' 
         : 'PROFILE_PHOTO';

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);

  const pulseScale = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
  
  React.useEffect(() => {
    if (step === 'WAITING') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 800 }),
          withTiming(1.0, { duration: 800 }),
        ),
        -1, true
      );
    }
  }, [step]);

  // Profile Photo
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);

  // Vehicle
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('SEDAN');

  // License
  const [licenseFrontUri, setLicenseFrontUri] = useState<string | null>(null);
  const [licenseBackUri, setLicenseBackUri] = useState<string | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  
  // Registration
  const [registrationPhotoUri, setRegistrationPhotoUri] = useState<string | null>(null);

  const pickImage = async (setter: (uri: string) => void, aspect: [number, number] = [4, 3]) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ('Images' as any),
      allowsEditing: false, // OFF to prevent iOS Simulator crop editor crash
      quality: 0.5,
    });
    if (__DEV__) console.log('[ImagePicker] Result:', JSON.stringify(result));
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setter(result.assets[0].uri);
    } else {
      if (__DEV__) console.log('[ImagePicker] Operation canceled or no assets.');
    }
  };

  const uploadPhoto = async (uri: string, endpoint: string, fieldName: string) => {
      const filename = uri.split('/').pop() || 'photo.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      const formData = new FormData();
      // @ts-ignore
      formData.append(fieldName, { uri, name: filename, type });

      const res = await client.post(endpoint, formData);
      return res.data;
  }

  const submitStep = async () => {
    setLoading(true);
    try {
      if (step === 'PROFILE_PHOTO') {
        if (!profilePhotoUri) return Alert.alert('Error', 'La foto de perfil es obligatoria.');
        const resData = await uploadPhoto(profilePhotoUri, '/auth/profile/avatar', 'avatar');
        // Update local user softly without triggering global AppNavigator unmount
        if (resData && resData.data) {
            useAuthStore.getState().updateUser(resData.data);
        }
        setStep('VEHICLE');
      } 
      else if (step === 'VEHICLE') {
        if (!make || !model || !plate || !color || !year) {
          return Alert.alert('Error', 'Todos los campos del vehículo son obligatorios');
        }
        await client.put('/auth/profile', {
          vehicle: { make, model, year: parseInt(year) || null, color, plate, type: vehicleType, capacity: 4 }
        });
        setStep('LICENSE');
      } 
      else if (step === 'LICENSE') {
        if (!licenseFrontUri || !licenseBackUri || !licenseNumber) {
          return Alert.alert('Error', 'Fotos de frente/dorso y número de licencia son requeridos.');
        }
        // Nota: En producción esto subiría los archivos y guardaría en la BD reales.
        // Aquí simularemos el update a profile para demostrar el flow sin un endpoint complejo multipart masivo.
        await client.put('/auth/profile', {
             // Mockup temporal: guardariamos las URLs reales tras subirlas a S3
             driverLicense: { number: licenseNumber }
        });
        setStep('REGISTRATION');
      }
      else if (step === 'REGISTRATION') {
        if (!registrationPhotoUri) {
          return Alert.alert('Error', 'Foto del registro/matrícula es requerida.');
        }
        const res = await client.put('/auth/profile', {
          driverApprovalStatus: 'UNDER_REVIEW', // Cambia estado central
          approvalStatus: 'UNDER_REVIEW'
        });
        if (res.data && res.data.data) {
           useAuthStore.getState().updateUser(res.data.data);
        }
        setStep('WAITING');
      }
    } catch (error: unknown) {
      Alert.alert('Error', e.response?.data?.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const renderProfilePhoto = () => (
    <View>
      <Text style={styles.stepTitle}>Paso 1: Foto de Perfil</Text>
      <Text style={styles.bodyText}>Sube una foto clara de tu rostro. Es necesaria para generar confianza en tus viajes.</Text>
      {profilePhotoUri ? (
        <View style={styles.photoPreviewContainer}>
          <Image source={{ uri: profilePhotoUri }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.photoChangeBtn} onPress={() => pickImage(setProfilePhotoUri, [1,1])}>
            <Text style={styles.photoChangeBtnText}>Cambiar foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.photoPickerBtn} onPress={() => pickImage(setProfilePhotoUri, [1,1])}>
          <Ionicons name="camera-outline" size={32} color={theme.colors.primary} />
          <Text style={styles.photoPickerText}>Subir foto de perfil</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderVehicle = () => (
    <View>
      <Text style={styles.stepTitle}>Paso 2: Datos del vehículo</Text>
      <TextInput style={styles.input} placeholder="Marca (ej: Toyota)" placeholderTextColor={theme.colors.inputPlaceholder} value={make} onChangeText={setMake} />
      <TextInput style={styles.input} placeholder="Modelo (ej: Corolla)" placeholderTextColor={theme.colors.inputPlaceholder} value={model} onChangeText={setModel} />
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Año" placeholderTextColor={theme.colors.inputPlaceholder} value={year} onChangeText={setYear} keyboardType="numeric" />
        <TextInput style={[styles.input, styles.halfInput]} placeholder="Color" placeholderTextColor={theme.colors.inputPlaceholder} value={color} onChangeText={setColor} />
      </View>
      <TextInput style={styles.input} placeholder="Matrícula (ej: ABC-123)" placeholderTextColor={theme.colors.inputPlaceholder} value={plate} onChangeText={setPlate} autoCapitalize="characters" />
    </View>
  );

  const renderLicense = () => (
    <View>
      <Text style={styles.stepTitle}>Paso 3: Licencia de Conducir</Text>
      <TextInput style={styles.input} placeholder="Nº de Licencia" placeholderTextColor={theme.colors.inputPlaceholder} value={licenseNumber} onChangeText={setLicenseNumber} />
      <View style={styles.row}>
          {licenseFrontUri ? (
            <View style={[styles.photoPreviewContainer, styles.halfInput]}>
              <Image source={{ uri: licenseFrontUri }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.photoChangeBtn} onPress={() => pickImage(setLicenseFrontUri)}>
                <Text style={styles.photoChangeBtnText}>Cambiar foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.photoPickerBtn, styles.halfInput]} onPress={() => pickImage(setLicenseFrontUri)}>
              <Ionicons name="camera-outline" size={32} color={theme.colors.primary} />
              <Text style={styles.photoPickerText}>Frente</Text>
            </TouchableOpacity>
          )}

          {licenseBackUri ? (
            <View style={[styles.photoPreviewContainer, styles.halfInput]}>
              <Image source={{ uri: licenseBackUri }} style={styles.photoPreview} />
              <TouchableOpacity style={styles.photoChangeBtn} onPress={() => pickImage(setLicenseBackUri)}>
                <Text style={styles.photoChangeBtnText}>Cambiar foto</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.photoPickerBtn, styles.halfInput]} onPress={() => pickImage(setLicenseBackUri)}>
              <Ionicons name="camera-outline" size={32} color={theme.colors.primary} />
              <Text style={styles.photoPickerText}>Dorso</Text>
            </TouchableOpacity>
          )}
      </View>
    </View>
  );

  const renderRegistration = () => (
    <View>
      <Text style={styles.stepTitle}>Paso 4: Permiso de Circulación</Text>
      {registrationPhotoUri ? (
        <View style={styles.photoPreviewContainer}>
          <Image source={{ uri: registrationPhotoUri }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.photoChangeBtn} onPress={() => pickImage(setRegistrationPhotoUri)}>
            <Text style={styles.photoChangeBtnText}>Cambiar foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.photoPickerBtn} onPress={() => pickImage(setRegistrationPhotoUri)}>
          <Ionicons name="camera-outline" size={32} color={theme.colors.primary} />
          <Text style={styles.photoPickerText}>Añadir foto del permiso de circulación o seguro operativo.</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderWaiting = () => {
    if (user?.approvalStatus === 'REJECTED') {
         return (
             <View style={styles.centerBox}>
                 <Text style={{fontSize: 50, marginBottom: 10}}>❌</Text>
                 <Text style={[styles.stepTitle, {textAlign: 'center', color: theme.colors.error}]}>Solicitud Rechazada</Text>
                 <Text style={styles.bodyText}>Motivo: {user?.rejectionReason || 'Documentación inválida'}</Text>
                 <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('PROFILE_PHOTO')}>
                     <Text style={styles.nextBtnText}>Reintentar Registro</Text>
                 </TouchableOpacity>
             </View>
         );
    }

    return (
        <View style={styles.centerBox}>
            <Animated.View style={pulseStyle}>
               <Text style={{fontSize: 50, marginBottom: 10}}>⏳</Text>
            </Animated.View>
            <Text style={[styles.stepTitle, {textAlign: 'center'}]}>Documentos en Revisión</Text>
            <Text style={[styles.bodyText, {textAlign: 'center'}]}>Nuestro equipo está validando tu identidad. Esto suele demorar menos de 24 hrs. Te notificaremos por Push cuando seas aprobado.</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={checkAuth} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.colors.text} /> : <Text style={styles.refreshBtnText}>Actualizar Estado</Text>}
            </TouchableOpacity>
        </View>
    );
  };

  const getStepIndex = () => {
      if (step === 'PROFILE_PHOTO') return 0;
      if (step === 'VEHICLE') return 1;
      if (step === 'LICENSE') return 2;
      if (step === 'REGISTRATION') return 3;
      return 4;
  }

  const handleBack = () => {
      const idx = getStepIndex();
      if (idx === 1) setStep('PROFILE_PHOTO');
      if (idx === 2) setStep('VEHICLE');
      if (idx === 3) setStep('LICENSE');
  }

  const StepIndicator = () => {
    const currentIndex = STEPS.indexOf(step);
    return (
      <View style={styles.stepperContainer}>
        {STEPS.map((s, i) => {
          const isCompleted = i < currentIndex;
          const isActive = i === currentIndex;
          return (
            <React.Fragment key={s}>
              <View style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isCompleted && styles.stepDotCompleted,
              ]}>
                {isCompleted
                  ? <Ionicons name="checkmark" size={12} color={theme.colors.primaryText} />
                  : <Text style={[styles.stepDotText, isActive && { color: theme.colors.primaryText }]}>
                      {i + 1}
                    </Text>
                }
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepLine, (isCompleted) && styles.stepLineCompleted]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        
        {step !== 'WAITING' && (
            <>
              <StepIndicator />
              <Text style={styles.header}>Onboarding Conductores</Text>
            </>
        )}

        {step === 'PROFILE_PHOTO' && renderProfilePhoto()}
        {step === 'VEHICLE' && renderVehicle()}
        {step === 'LICENSE' && renderLicense()}
        {step === 'REGISTRATION' && renderRegistration()}
        {step === 'WAITING' && renderWaiting()}

        {step !== 'WAITING' && (
          <TouchableOpacity style={[styles.nextBtn, loading && { opacity: 0.5 }]} onPress={submitStep} disabled={loading}>
            {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : (
              <Text style={styles.nextBtnText}>{step === 'REGISTRATION' ? 'Enviar a Revisión' : 'Siguiente'}</Text>
            )}
          </TouchableOpacity>
        )}

        {step !== 'PROFILE_PHOTO' && step !== 'WAITING' && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} disabled={loading}>
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
  header: { ...theme.typography.header, fontSize: 24, marginBottom: 24, alignSelf: 'center' },
  stepTitle: { ...theme.typography.title, fontSize: 18, marginBottom: 16 },
  bodyText: { ...theme.typography.body, color: theme.colors.textMuted, marginBottom: 20, lineHeight: 22 },
  input: {
    backgroundColor: theme.colors.surface, padding: 14, borderRadius: 12,
    marginBottom: 12, fontSize: 15, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1 },
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
    borderRadius: 16, padding: 32, alignItems: 'center', backgroundColor: theme.colors.surface, alignSelf: 'center', minWidth: '100%',
  },
  uploadIcon: { fontSize: 40, marginBottom: 12 },
  uploadText: { ...theme.typography.body, textAlign: 'center', color: theme.colors.primary, fontWeight: '600' },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  refreshBtn: {
    backgroundColor: theme.colors.surface, padding: 16, borderRadius: 30,
    alignItems: 'center', marginTop: 30, borderWidth: 1, borderColor: theme.colors.border, width: '100%'
  },
  refreshBtnText: { ...theme.typography.body, fontWeight: '600', color: theme.colors.text },
  stepperContainer: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing?.l || 20, marginBottom: theme.spacing?.xl || 30,
  },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.colors.surfaceHigh || '#F3F4F6',
    borderWidth: 1.5, borderColor: theme.colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepDotCompleted: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepDotText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  stepLine: { flex: 1, height: 1.5, backgroundColor: theme.colors.border },
  stepLineCompleted: { backgroundColor: theme.colors.primary },
  photoPreviewContainer: { alignItems: 'center', marginBottom: theme.spacing?.l || 20 },
  photoPreview: {
    width: 120, height: 120, borderRadius: 60,
    borderWidth: 3, borderColor: theme.colors.primary,
  },
  photoChangeBtn: {
    marginTop: theme.spacing?.m || 10, padding: 8,
  },
  photoChangeBtnText: { color: theme.colors.link || theme.colors.primary, fontWeight: '600', fontSize: 14 },
  photoPickerBtn: {
    height: 120, backgroundColor: theme.colors.surfaceHigh || '#F3F4F6',
    borderRadius: theme.borderRadius?.l || 16, borderWidth: 1.5,
    borderColor: theme.colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 8,
    marginBottom: theme.spacing?.l || 20,
  },
  photoPickerText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '500' },
});
