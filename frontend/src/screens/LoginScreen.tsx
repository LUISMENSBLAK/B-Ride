import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from '../hooks/useTranslation';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAppleAuth } from '../hooks/useAppleAuth';

export default function LoginScreen({ navigation }: any) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    const login = useAuthStore(state => state.login);
    const { handleGoogleLogin, loading: googleLoading, ready: googleReady } = useGoogleAuth();
    const { handleAppleLogin, loading: appleLoading } = useAppleAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert(t('auth.wait'), t('auth.fillAllFields'));
            return;
        }

        setLoading(true);
        try {
            const res = await client.post('/auth/login', { email, password });
            if (res.data.success) {
                await login(res.data.data);
            }
        } catch (error: unknown) {
            if (error.message === 'Network Error' || error.message.includes('fetch failed')) {
                Alert.alert('Error de red', 'No hay conexión con el servidor. Revisa tu conexión de red o asegura que el servidor esté activo.');
                return;
            }
            const data = error.response?.data;
            if (data?.code === 'NOT_VERIFIED' || error.response?.status === 403) {
                 Alert.alert('Verificación Requerida', data?.message || 'Revisa tu email por el código.');
                 navigation.navigate('VerifyEmail', { email });
                 return;
            }
            Alert.alert(t('auth.loginFailed'), data?.message || t('auth.somethingWentWrong'));
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
      try {
        const result = await handleGoogleLogin();
        if (result?.success) {
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
          await login(result.data);
        }
      } catch (error: unknown) {
        Alert.alert('Error', error.message || 'No se pudo iniciar sesión con Apple');
      }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView 
                style={styles.container} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.content}>
                    
                    <View style={styles.headerContainer}>
                        <Image source={require('../../assets/ride.png')} style={styles.logo} resizeMode="contain" />
                        <Text style={styles.title}>{t('auth.welcome')}</Text>
                        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
                    </View>

                    <View style={styles.formCard}>
                        {/* Apple Sign-In */}
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

                        {/* Google Sign-In */}
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
                          <Text style={[styles.dividerText, { color: theme.colors.textMuted }]}>o usa tu email</Text>
                          <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
                        </View>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.emailPlaceholder')}
                                placeholderTextColor={theme.colors.inputPlaceholder}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                returnKeyType="next"
                            />
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.passwordPlaceholder')}
                                placeholderTextColor={theme.colors.inputPlaceholder}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
                                returnKeyType="done"
                                onSubmitEditing={handleLogin}
                            />
                            
                            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                                <Text style={styles.forgotPassword}>{t('auth.forgotPassword')}</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                            {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : <Text style={styles.buttonText}>{t('auth.continue')}</Text>}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                            <Text style={styles.linkText}>{t('auth.registerLink')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const getStyles = (theme: any) => StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.xl,
    },
    headerContainer: {
        marginBottom: theme.spacing.xl,
        alignItems: 'center',
    },
    logo: {
        width: 80,
        height: 80,
        marginBottom: theme.spacing.l,
    },
    title: {
        ...theme.typography.header,
        textAlign: 'center',
        marginBottom: theme.spacing.xs,
    },
    subtitle: {
        ...theme.typography.bodyMuted,
        textAlign: 'center',
    },
    formCard: {
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.l,
        borderRadius: theme.borderRadius.l,
        borderWidth: 1,
        borderColor: theme.colors.border,
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
        elevation: 3,
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
    // Google Button
    googleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        height: 52,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.l,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
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
    inputContainer: {
        marginBottom: theme.spacing.xl,
    },
    input: {
        backgroundColor: theme.colors.surfaceHigh,
        padding: 16,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.m,
        fontSize: 16,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    forgotPassword: {
        ...theme.typography.bodyMuted,
        textAlign: 'right',
        fontSize: 14,
        marginTop: theme.spacing.xs,
        color: theme.colors.primary,
        fontWeight: '500',
    },
    button: {
        backgroundColor: theme.colors.primary,
        padding: 16,
        borderRadius: theme.borderRadius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonText: {
        ...theme.typography.button,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: theme.spacing.xxl,
    },
    footerText: {
        ...theme.typography.body,
        color: theme.colors.textMuted,
    },
    linkText: {
        ...theme.typography.body,
        color: theme.colors.link,
        fontWeight: '600',
    },
});
