import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import client from '../../api/client';
import { useAppTheme } from '../../hooks/useAppTheme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = {
    navigation: NativeStackNavigationProp<any>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => getStyles(theme), [theme]);
    
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const handleRestore = async () => {
        if (!email.trim() || !email.includes('@')) {
            Alert.alert('Error', 'Ingresa un correo electrónico válido');
            return;
        }

        setLoading(true);
        setSuccessMsg('');
        try {
            const res = await client.post('/auth/forgotpassword', { email });
            if (res.data.success) {
                setSuccessMsg('Se ha enviado un enlace de recuperación a tu correo electrónico. Sigue las instrucciones para restablecer tu contraseña.');
            }
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.message || 'No se pudo procesar la solicitud.');
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
                        <Text style={styles.title}>Recuperar Contraseña</Text>
                        <Text style={styles.subtitle}>Ingresa tu correo para recibir las instrucciones y restablecer tu acceso.</Text>
                    </View>

                    {successMsg ? (
                        <View style={styles.successBox}>
                            <Text style={styles.successText}>✅ {successMsg}</Text>
                            <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Login')}>
                                <Text style={styles.buttonText}>Volver al Inicio</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.formCard}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.label}>Correo Electrónico</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="ejemplo@correo.com"
                                    placeholderTextColor={theme.colors.inputPlaceholder}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={email}
                                    onChangeText={setEmail}
                                    editable={!loading}
                                />
                            </View>

                            <TouchableOpacity style={styles.button} onPress={handleRestore} disabled={loading}>
                                {loading ? <ActivityIndicator color={theme.colors.primaryText} /> : <Text style={styles.buttonText}>Recuperar Contraseña</Text>}
                            </TouchableOpacity>
                        </View>
                    )}

                    <View style={styles.footer}>
                        <TouchableOpacity onPress={() => navigation.goBack()}>
                            <Text style={styles.linkText}>Volver atrás</Text>
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
    subtitle: { ...theme.typography.bodyMuted, textAlign: 'center', paddingHorizontal: 20 },
    formCard: {
        backgroundColor: theme.colors.surface, padding: theme.spacing.l,
        borderRadius: theme.borderRadius.l, borderWidth: 1, borderColor: theme.colors.border,
        shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
    },
    inputContainer: { marginBottom: theme.spacing.l },
    label: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.s, fontWeight: '600' },
    input: {
        backgroundColor: theme.colors.inputBackground, color: theme.colors.text,
        padding: 14, borderRadius: theme.borderRadius.m, fontSize: 16,
        borderWidth: 1, borderColor: theme.colors.borderLight
    },
    button: {
        backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.borderRadius.pill,
        alignItems: 'center', justifyContent: 'center', shadowColor: theme.colors.primary,
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
    },
    buttonText: { ...theme.typography.button },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.xxl },
    linkText: { ...theme.typography.body, color: theme.colors.link, fontWeight: '600' },
    successBox: {
        backgroundColor: theme.colors.success + '20',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.success + '40',
        alignItems: 'center',
    },
    successText: {
        color: theme.colors.text,
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 24,
    }
});
