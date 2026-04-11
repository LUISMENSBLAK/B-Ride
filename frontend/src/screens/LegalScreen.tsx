import React from 'react';
import { ScrollView, Text, StyleSheet, Platform, SafeAreaView, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../hooks/useAppTheme';
import { useTranslation } from '../hooks/useTranslation';

interface Props {
  onAccept?: () => void;
}

/**
 * L2: Pantalla de Política de Privacidad y Términos de Servicio.
 */
export default function LegalScreen({ onAccept }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>📜 Términos de Servicio y Política de Privacidad</Text>
        <Text style={styles.updated}>Última actualización: {new Date().toLocaleDateString()}</Text>

        <Text style={styles.section}>1. Aceptación de Términos</Text>
        <Text style={styles.body}>
          Al utilizar B-Ride, aceptas cumplir con estos Términos de Servicio y nuestra Política de Privacidad.
          Si no estás de acuerdo, no utilices la aplicación.
        </Text>

        <Text style={styles.section}>2. Descripción del Servicio</Text>
        <Text style={styles.body}>
          B-Ride es una plataforma que conecta pasajeros con conductores independientes.
          B-Ride no es una empresa de transporte y no emplea directamente a los conductores.
        </Text>

        <Text style={styles.section}>3. Cuentas de Usuario</Text>
        <Text style={styles.body}>
          • Debes proporcionar información veraz{'\n'}
          • Eres responsable de la seguridad de tu cuenta{'\n'}
          • Una cuenta por persona{'\n'}
          • Debes ser mayor de 18 años
        </Text>

        <Text style={styles.section}>4. Privacidad y Datos</Text>
        <Text style={styles.body}>
          Recopilamos:{'\n'}
          • Datos de ubicación (solo durante viajes activos){'\n'}
          • Información de perfil{'\n'}
          • Datos de pago (procesados por Stripe){'\n'}
          • Historial de viajes{'\n\n'}
          Tus derechos:{'\n'}
          • Acceder a tus datos personales{'\n'}
          • Solicitar eliminación de tu cuenta{'\n'}
          • Exportar tus datos{'\n'}
          • Revocar permisos de ubicación
        </Text>

        <Text style={styles.section}>5. Pagos</Text>
        <Text style={styles.body}>
          • Las tarifas se negocian entre pasajero y conductor{'\n'}
          • B-Ride cobra una comisión del 15% por servicio{'\n'}
          • Las cancelaciones después de 2 minutos pueden generar cargo{'\n'}
          • Los pagos son procesados de forma segura por Stripe
        </Text>

        <Text style={styles.section}>6. Seguridad</Text>
        <Text style={styles.body}>
          • Todos los conductores pasan por un proceso de verificación{'\n'}
          • El botón SOS está disponible durante viajes activos{'\n'}
          • Puedes compartir tu viaje en tiempo real{'\n'}
          • Reporta cualquier incidente a través de la app
        </Text>

        <Text style={styles.section}>7. Conducta</Text>
        <Text style={styles.body}>
          Queda prohibido:{'\n'}
          • Uso fraudulento de la plataforma{'\n'}
          • Manipulación de ubicación GPS{'\n'}
          • Comportamiento abusivo o discriminatorio{'\n'}
          • Compartir cuentas con terceros
        </Text>

        <Text style={styles.section}>8. Contacto</Text>
        <Text style={styles.body}>
          Para preguntas sobre privacidad o estos términos, contacta:{'\n'}
          soporte@b-ride.com
        </Text>

        {onAccept && (
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
            <Text style={styles.acceptBtnText}>Aceptar y continuar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 60, paddingTop: Platform.OS === 'ios' ? 20 : 40 },
  title: { ...theme.typography.header, fontSize: 22, marginBottom: 8 },
  updated: { ...theme.typography.bodyMuted, fontSize: 12, marginBottom: 24 },
  section: { ...theme.typography.title, fontSize: 16, marginTop: 20, marginBottom: 8, color: theme.colors.primary },
  body: { ...theme.typography.body, fontSize: 14, lineHeight: 22, color: theme.colors.textMuted },
  acceptBtn: {
    backgroundColor: theme.colors.primary, padding: 16, borderRadius: 30,
    alignItems: 'center', marginTop: 32,
  },
  acceptBtnText: { ...theme.typography.button, fontSize: 16 },
});
