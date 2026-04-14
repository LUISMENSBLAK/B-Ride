import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView,
  Platform, Image
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSequence, withTiming,
} from 'react-native-reanimated';
import auth from '@react-native-firebase/auth';
import client from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function VerifyEmailScreen({ route, navigation }: any) {
  const { email } = route.params;
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const login = useAuthStore(state => state.login);
  const clearJustRegistered = useAuthStore(state => state.clearJustRegistered);
  const inputs = useRef<Array<TextInput | null>>([]);

  // Animación shake para código incorrecto
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10, { duration: 60 }),
      withTiming(-8, { duration: 60 }),
      withTiming(8, { duration: 60 }),
      withTiming(0, { duration: 60 }),
    );
  }, [shakeX]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    // Soporte para pegar código completo
    if (text.length === 6 && /^\d{6}$/.test(text)) {
      const digits = text.split('');
      setCode(digits);
      inputs.current[5]?.focus();
      setTimeout(() => handleVerifyCode(digits.join('')), 100);
      return;
    }
    const newCode = [...code];
    newCode[index] = text.slice(-1);
    setCode(newCode);
    if (text && index < 5) {
      inputs.current[index + 1]?.focus();
      setFocusedIndex(index + 1);
    }
    // Auto-submit al completar
    if (index === 5 && text) {
      const full = [...newCode.slice(0, 5), text.slice(-1)].join('');
      if (full.length === 6) setTimeout(() => handleVerifyCode(full), 150);
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      inputs.current[index - 1]?.focus();
      setFocusedIndex(index - 1);
      const newCode = [...code];
      newCode[index - 1] = '';
      setCode(newCode);
    }
  };

  const handleVerifyCode = async (fullCode?: string) => {
    const codeToVerify = fullCode || code.join('');
    if (codeToVerify.length < 6) {
      triggerShake();
      Alert.alert('Error', 'Introduce el código completo de 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const res = await client.post('/auth/verify-email', { email, code: codeToVerify });
      if (res.data.success) {
        await login(res.data.data);
        clearJustRegistered();
      }
    } catch (error: unknown) {
      triggerShake();
      setCode(['', '', '', '', '', '']);
      inputs.current[0]?.focus();
      Alert.alert('Código incorrecto', error.response?.data?.message || 'El código es incorrecto o ha expirado.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    try {
      const res = await client.post('/auth/resend-verification', { email });
      if (res.data.success) {
        setCountdown(60);
        setCode(['', '', '', '', '', '']);
        inputs.current[0]?.focus();
      }
    } catch (error: unknown) {
      Alert.alert('Error', error.response?.data?.message || 'No se pudo reenviar el código.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <View style={styles.headerContainer}>
            <Image source={require('../../../assets/ride.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>Verifica tu Email</Text>
            <Text style={styles.subtitle}>
              Enviamos un código de 6 dígitos a{'\n'}
              <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{email}</Text>
            </Text>
          </View>

          <View style={styles.formCard}>
            <Animated.View style={[styles.otpContainer, shakeStyle]}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => (inputs.current[index] = ref)}
                  style={[
                    styles.otpInput,
                    focusedIndex === index && styles.otpInputFocused,
                    digit !== '' && styles.otpInputFilled,
                  ]}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={digit}
                  onChangeText={text => handleChange(text, index)}
                  onKeyPress={e => handleKeyPress(e, index)}
                  onFocus={() => setFocusedIndex(index)}
                  selectTextOnFocus
                />
              ))}
            </Animated.View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={() => handleVerifyCode()}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={theme.colors.primaryText} />
                : <Text style={styles.buttonText}>Verificar</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={handleResend} disabled={countdown > 0 || resendLoading}>
              <Text style={[styles.linkText, (countdown > 0 || resendLoading) && { color: theme.colors.textMuted }]}>
                {resendLoading ? 'Enviando...' : countdown > 0 ? `Reenviar código en ${countdown}s` : 'Reenviar código'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.hintText}>¿No lo ves? Revisa tu carpeta de Spam.</Text>
            <View style={{ height: 12 }} />
            <TouchableOpacity onPress={async () => {
              clearJustRegistered();
              await useAuthStore.getState().logout();
            }}>
              <Text style={styles.linkText}>¿No eres tú? Volver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: theme.spacing.l, paddingTop: theme.spacing.xxxl },
  headerContainer: { marginBottom: theme.spacing.xl, alignItems: 'center' },
  logo: { width: 80, height: 80, marginBottom: theme.spacing.l },
  title: { ...theme.typography.header, textAlign: 'center', marginBottom: theme.spacing.s },
  subtitle: { ...theme.typography.bodyMuted, textAlign: 'center', lineHeight: 22 },
  formCard: {
    backgroundColor: theme.colors.surface, padding: theme.spacing.l,
    borderRadius: theme.borderRadius.l, borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  otpContainer: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: theme.spacing.xl, gap: 8,
  },
  otpInput: {
    flex: 1, height: 64,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.m,
    fontSize: 28, textAlign: 'center',
    color: theme.colors.text,
    borderWidth: 1.5, borderColor: theme.colors.border,
    fontWeight: 'bold',
  },
  otpInputFocused: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: theme.colors.primaryLight,
  },
  otpInputFilled: {
    borderColor: theme.colors.success,
    borderWidth: 1.5,
  },
  button: {
    backgroundColor: theme.colors.primary, padding: 16,
    borderRadius: theme.borderRadius.pill, alignItems: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  buttonText: { ...theme.typography.button },
  footer: { alignItems: 'center', marginTop: theme.spacing.xxl, gap: 8 },
  linkText: { ...theme.typography.body, color: theme.colors.link, fontWeight: '600' },
  hintText: { ...theme.typography.caption, color: theme.colors.textMuted, textAlign: 'center' },
});
