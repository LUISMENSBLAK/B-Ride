import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';

export default function LoginScreen({
 navigation }: any) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    const login = useAuthStore(state => state.login);

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
        } catch (error: any) {
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
                            
                            <TouchableOpacity onPress={() => Alert.alert(
                              t('auth.recoverPassword', { defaultValue: 'Recuperar contraseña' }),
                              t('auth.recoverPasswordMsg', { defaultValue: 'Contacta a soporte en soporte@b-ride.com para restablecer tu contraseña.' })
                            )}>
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
        paddingTop: theme.spacing.xxxl,
    },
    headerContainer: {
        marginBottom: theme.spacing.xxl,
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
    inputContainer: {
        marginBottom: theme.spacing.xl,
    },
    input: {
        backgroundColor: theme.colors.background,
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
