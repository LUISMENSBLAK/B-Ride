import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';
import PhoneInput from '../components/PhoneInput';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAppleAuth } from '../hooks/useAppleAuth';

export default function RegisterScreen({ navigation }: any) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState('USER');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { t } = useTranslation();

  const register = useAuthStore(state => state.register);
  const { handleGoogleLogin, loading: googleLoading, ready: googleReady } = useGoogleAuth();
  const { handleAppleLogin, loading: appleLoading } = useAppleAuth();

  const emailRef = React.useRef<TextInput>(null);
  const passRef = React.useRef<TextInput>(null);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert(t('auth.wait'), t('auth.fillAllFields'));
      return;
    }
    if (!termsAccepted) {
      Alert.alert(t('auth.wait'), t('auth.acceptTerms', { defaultValue: 'Debes aceptar los términos y condiciones' }));
      return;
    }

    setLoading(true);
    try {
      const res = await client.post('/auth/register', {
        name, email, password, role,
        phoneNumber: phoneNumber || undefined,
        termsAcceptedAt: new Date().toISOString(),
      });
      if (res.data.success) {
        // Always use register() — sets justRegistered=true → routes to VerifyEmail
        await register(res.data.data);
      }
    } catch (error: unknown) {
      if (error.message === 'Network Error' || error.message.includes('fetch failed')) {
        Alert.alert('Error de red', 'No hay conexión con el servidor. Revisa tu conexión de red o asegura que el servidor esté activo.');
      } else {
        const backendMessage = error.response?.data?.message || t('auth.somethingWentWrong');
        if (backendMessage.includes('ya está registrado') || backendMessage.includes('already exists')) {
          Alert.alert(
            'Cuenta Existente',
            'Este correo electrónico ya está registrado. ¿Deseas iniciar sesión?',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Ir a Login', onPress: () => navigation.navigate('Login') }
            ]
          );
        } else {
          Alert.alert('Error de registro', backendMessage);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await handleGoogleLogin();
      if (result?.success) {
        // Google accounts are pre-verified → use login() (justRegistered=false)
        const login = useAuthStore.getState().login;
        await login(result.data);
      }
    } catch (error: unknown) {
      Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Google');
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const result = await handleAppleLogin();
      if (result?.success) {
        // Apple accounts are pre-verified → use login() (justRegistered=false)
        const login = useAuthStore.getState().login;
        await login(result.data);
      }
    } catch (error: unknown) {
      Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Apple');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          <View style={styles.headerContainer}>
            <Image source={require('../../assets/ride.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>{t('auth.createAccount')}</Text>
            <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
          </View>

          <View style={styles.formCard}>
            {/* Apple Sign-In Button */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.appleBtn}
                onPress={handleAppleSignIn}
                disabled={appleLoading}
                activeOpacity={0.8}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                    <Text style={styles.appleBtnText}>Continuar con Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {/* Google Sign-In Button */}
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              disabled={googleLoading || !googleReady}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color="#0D0520" size="small" />
              ) : (
                <>
                  <Image 
                    source={require('../../assets/google-logo.png')}
                    style={styles.googleImage} 
                  />
                  <Text style={styles.googleBtnText}>Continuar con Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              <Text style={[styles.dividerText, { color: theme.colors.textMuted }]}>o regístrate con email</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            </View>

            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={t('auth.fullNamePlaceholder')}
                placeholderTextColor={theme.colors.inputPlaceholder}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
              />
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={theme.colors.inputPlaceholder}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />

              {/* Phone Input with country selector */}
              <PhoneInput
                value={phoneNumber}
                onChangePhone={setPhoneNumber}
                placeholder={t('auth.phonePlaceholder', { defaultValue: 'Número de teléfono' })}
              />
              <View style={{ height: 12 }} />

              <TextInput
                ref={passRef}
                style={styles.input}
                placeholder={t('auth.passwordPlaceholder')}
                placeholderTextColor={theme.colors.inputPlaceholder}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                returnKeyType="done"
              />
            </View>

            <Text style={styles.roleLabel}>{t('auth.registerAs')}</Text>
            <View style={styles.roleContainer}>
              <TouchableOpacity
                style={[styles.roleButton, role === 'USER' && styles.roleButtonActive]}
                onPress={() => setRole('USER')}
              >
                <Text style={[styles.roleText, role === 'USER' && styles.roleTextActive]}>{t('auth.rolePassenger')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, role === 'DRIVER' && styles.roleButtonActive]}
                onPress={() => setRole('DRIVER')}
              >
                <Text style={[styles.roleText, role === 'DRIVER' && styles.roleTextActive]}>{t('auth.roleDriver')}</Text>
              </TouchableOpacity>
            </View>

            {/* Terms checkbox */}
            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxActive]}>
                {termsAccepted && <Ionicons name="checkmark" size={14} color={theme.colors.primaryText} />}
              </View>
              <Text style={styles.termsText}>
                {t('auth.acceptTermsLabel', { defaultValue: 'Acepto los ' })}
                <Text style={styles.termsLink}>
                  {t('auth.termsAndConditions', { defaultValue: 'Términos y Condiciones' })}
                </Text>
                {t('auth.andPrivacyPolicy', { defaultValue: ' y la Política de Privacidad' })}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, !termsAccepted && styles.buttonDisabled]} onPress={handleRegister} disabled={loading || !termsAccepted}>
              {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : <Text style={styles.buttonText}>{t('auth.register')}</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.alreadyHaveAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>{t('auth.loginLink')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: theme.spacing.l, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
  headerContainer: { marginBottom: theme.spacing.xl, alignItems: 'center' },
  logo: { width: 80, height: 80, marginBottom: theme.spacing.l },
  title: { ...theme.typography.header, textAlign: 'center', marginBottom: theme.spacing.xs },
  subtitle: { ...theme.typography.bodyMuted, textAlign: 'center' },
  formCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.l, borderRadius: theme.borderRadius.l,
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  // Apple Button
  appleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000000',
      height: 52,
      borderRadius: theme.borderRadius.m,
      marginBottom: theme.spacing.m,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
  },
  appleBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600' as const,
  },
  // Google button
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.l, // more margin since there's an Apple button above potentially
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleIconWrap: {
    display: 'none',
  },
  googleIcon: {
    display: 'none',
  },
  googleImage: {
    width: 24,
    height: 24,
  },
  googleBtnText: {
    color: '#1F1F1F',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.m,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },
  inputContainer: { marginBottom: theme.spacing.m },
  input: {
    backgroundColor: theme.colors.surfaceHigh, padding: 16, borderRadius: theme.borderRadius.m,
    marginBottom: theme.spacing.m, fontSize: 16, color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border,
  },
  roleLabel: { ...theme.typography.body, fontWeight: '600', marginBottom: theme.spacing.s },
  roleContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.l },
  roleButton: {
    flex: 1, padding: 14, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.m, marginHorizontal: 4, alignItems: 'center', backgroundColor: theme.colors.background,
  },
  roleButtonActive: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  roleText: { ...theme.typography.body, color: theme.colors.textMuted, fontWeight: '600' },
  roleTextActive: { color: theme.colors.primary },
  // Terms
  termsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.l, paddingHorizontal: 4 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border,
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  checkboxActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  termsText: { ...theme.typography.bodyMuted, flex: 1, fontSize: 13, lineHeight: 18 },
  termsLink: { color: theme.colors.link, fontWeight: '600' },
  button: {
    backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.borderRadius.pill,
    alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.m,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...theme.typography.button },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.l },
  footerText: { ...theme.typography.body, color: theme.colors.textMuted },
  linkText: { ...theme.typography.body, color: theme.colors.link, fontWeight: '600' },
});
