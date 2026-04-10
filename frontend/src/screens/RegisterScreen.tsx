import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import client from '../api/client';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';
import { useTranslation } from '../hooks/useTranslation';

export default function RegisterScreen({
 navigation }: any) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('USER'); // Default to Passenger
    const [loading, setLoading] = useState(false);
    const { t } = useTranslation();

    const login = useAuthStore(state => state.login);

    const handleRegister = async () => {
        if (!name || !email || !password) {
            Alert.alert(t('auth.wait'), t('auth.fillAllFields'));
            return;
        }

        setLoading(true);
        try {
            const res = await client.post('/auth/register', { name, email, password, role });
            if (res.data.success) {
                // After successful registration, log them in automatically
                await login(res.data.data);
            }
        } catch (error: any) {
            Alert.alert('Registro fallido', error.response?.data?.message || t('auth.somethingWentWrong'));
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
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    
                    <View style={styles.headerContainer}>
                        <Image source={require('../../assets/ride.png')} style={styles.logo} resizeMode="contain" />
                        <Text style={styles.title}>{t('auth.createAccount')}</Text>
                        <Text style={styles.subtitle}>{t('auth.registerSubtitle')}</Text>
                    </View>

                    <View style={styles.formCard}>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.fullNamePlaceholder')}
                                placeholderTextColor={theme.colors.inputPlaceholder}
                                value={name}
                                onChangeText={setName}
                                autoCapitalize="words"
                            />
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.emailPlaceholder')}
                                placeholderTextColor={theme.colors.inputPlaceholder}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <TextInput
                                style={styles.input}
                                placeholder={t('auth.passwordPlaceholder')}
                                placeholderTextColor={theme.colors.inputPlaceholder}
                                secureTextEntry
                                value={password}
                                onChangeText={setPassword}
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

                        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
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
    safeArea: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: theme.spacing.l,
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.xxl,
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
    inputContainer: {
        marginBottom: theme.spacing.m,
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
    roleLabel: {
        ...theme.typography.body,
        fontWeight: '600',
        marginBottom: theme.spacing.s,
    },
    roleContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xl,
    },
    roleButton: {
        flex: 1,
        padding: 14,
        borderWidth: 1.5,
        borderColor: theme.colors.border,
        borderRadius: theme.borderRadius.m,
        marginHorizontal: 4,
        alignItems: 'center',
        backgroundColor: theme.colors.background,
    },
    roleButtonActive: {
        backgroundColor: theme.colors.primaryLight,
        borderColor: theme.colors.primary,
    },
    roleText: {
        ...theme.typography.body,
        color: theme.colors.textMuted,
        fontWeight: '600',
    },
    roleTextActive: {
        color: theme.colors.primary,
    },
    button: {
        backgroundColor: theme.colors.primary,
        padding: 16,
        borderRadius: theme.borderRadius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.m,
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
        marginTop: theme.spacing.l,
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
