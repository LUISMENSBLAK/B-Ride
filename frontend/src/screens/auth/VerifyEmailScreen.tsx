import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import client from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { useAppTheme } from '../../hooks/useAppTheme';

export default function VerifyEmailScreen({ route, navigation }: any) {
    const { email } = route.params;
    const theme = useAppTheme();
    const styles = React.useMemo(() => getStyles(theme), [theme]);
    
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const login = useAuthStore(state => state.login);
    
    const inputs = useRef<Array<TextInput | null>>([]);

    const handleChange = (text: string, index: number) => {
        const newCode = [...code];
        newCode[index] = text;
        setCode(newCode);

        // Auto move to next input
        if (text && index < 5) {
            inputs.current[index + 1]?.focus();
        }
    };

    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
            inputs.current[index - 1]?.focus();
            const newCode = [...code];
            newCode[index - 1] = '';
            setCode(newCode);
        }
    };

    const handleVerify = async () => {
        const fullCode = code.join('');
        if (fullCode.length < 6) {
            Alert.alert('Error', 'Introduce el código completo de 6 dígitos.');
            return;
        }

        setLoading(true);
        try {
            const res = await client.post('/auth/verify-email', { email, code: fullCode });
            if (res.data.success) {
                await login(res.data.data);
            }
        } catch (error: any) {
            Alert.alert('Verificación fallida', error.response?.data?.message || 'Código incorrecto o expirado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.content}>
                    <View style={styles.headerContainer}>
                        <Image source={require('../../../assets/ride.png')} style={styles.logo} resizeMode="contain" />
                        <Text style={styles.title}>Verifica tu Email</Text>
                        <Text style={styles.subtitle}>Ingresa el código de 6 dígitos que enviamos a {email}</Text>
                    </View>

                    <View style={styles.formCard}>
                        <View style={styles.otpContainer}>
                            {code.map((digit, index) => (
                                <TextInput
                                    key={index}
                                    ref={(ref) => inputs.current[index] = ref}
                                    style={styles.otpInput}
                                    keyboardType="number-pad"
                                    maxLength={1}
                                    value={digit}
                                    onChangeText={(text) => handleChange(text, index)}
                                    onKeyPress={(e) => handleKeyPress(e, index)}
                                    selectTextOnFocus
                                />
                            ))}
                        </View>

                        <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
                            {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : <Text style={styles.buttonText}>Aceptar</Text>}
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={() => navigation.goBack()}>
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
    title: { ...theme.typography.header, textAlign: 'center', marginBottom: theme.spacing.xs },
    subtitle: { ...theme.typography.bodyMuted, textAlign: 'center' },
    formCard: {
        backgroundColor: theme.colors.surface, padding: theme.spacing.l,
        borderRadius: theme.borderRadius.l, borderWidth: 1, borderColor: theme.colors.border,
        shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
    },
    otpContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xl },
    otpInput: {
        width: 45, height: 55, backgroundColor: theme.colors.background,
        borderRadius: theme.borderRadius.m, fontSize: 24, textAlign: 'center',
        color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border,
        fontWeight: 'bold'
    },
    button: {
        backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.borderRadius.pill,
        alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    buttonText: { ...theme.typography.button },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl },
    linkText: { ...theme.typography.body, color: theme.colors.link, fontWeight: '600' },
});
