import React, { useRef, useState, useEffect } from 'react';
import {
  ScrollView, Text, StyleSheet, Platform,
  TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from '../hooks/useAppTheme';

const LEGAL_ACCEPTED_KEY = 'legal_accepted_v1';

interface Props {
  onAccept?: () => void;
}

const SECTIONS = [
  { id: 'privacy', label: '📋 Política de Privacidad' },
  { id: 'data', label: '📊 Datos que recopilamos' },
  { id: 'purpose', label: '🎯 Finalidad del tratamiento' },
  { id: 'legal_basis', label: '⚖️ Base legal' },
  { id: 'retention', label: '🕐 Plazo de conservación' },
  { id: 'rights', label: '✋ Derechos del usuario' },
  { id: 'controller', label: '🏢 Responsable del tratamiento' },
  { id: 'transfers', label: '🌐 Transferencias internacionales' },
  { id: 'cookies', label: '🍪 Almacenamiento local' },
  { id: 'terms', label: '📜 Términos y Condiciones' },
  { id: 'bids', label: '💰 Sistema de pujas' },
  { id: 'commission', label: '💳 Comisión de la plataforma' },
  { id: 'cancellations', label: '❌ Política de cancelaciones' },
  { id: 'liability', label: '🛡️ Responsabilidad' },
];

export default function LegalScreen({ onAccept }: Props) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);

  const sectionPositions = useRef<{ [key: string]: number }>({});

  const scrollToSection = (id: string) => {
    const y = sectionPositions.current[id];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: y - 20, animated: true });
    }
  };

  const handleAccept = async () => {
    await AsyncStorage.setItem(LEGAL_ACCEPTED_KEY, new Date().toISOString());
    onAccept?.();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 60) {
            setHasScrolledToEnd(true);
          }
        }}
        scrollEventThrottle={400}
      >
        <Text style={styles.title}>📜 Marco Legal de B-Ride</Text>
        <Text style={styles.updated}>Última actualización: {new Date().toLocaleDateString('es-ES')}</Text>

        {/* ── Índice navegable ── */}
        <View style={styles.indexBox}>
          <Text style={styles.indexTitle}>📑 Índice</Text>
          {SECTIONS.map(s => (
            <TouchableOpacity key={s.id} onPress={() => scrollToSection(s.id)} style={styles.indexItem}>
              <Text style={styles.indexText}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ══════════ POLÍTICA DE PRIVACIDAD ══════════ */}
        <View onLayout={e => sectionPositions.current['privacy'] = e.nativeEvent.layout.y}>
          <Text style={styles.sectionHeader}>POLÍTICA DE PRIVACIDAD</Text>
        </View>

        <View onLayout={e => sectionPositions.current['data'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>1. Datos que Recopilamos</Text>
          <Text style={styles.body}>
            B-Ride recopila los siguientes datos personales:{'\n\n'}
            <Text style={styles.bold}>Datos de identidad:</Text> Nombre completo, dirección de correo electrónico, número de teléfono, fotografía de perfil.{'\n\n'}
            <Text style={styles.bold}>Datos de ubicación:</Text> Coordenadas GPS en tiempo real durante viajes activos. Para conductores, ubicación en segundo plano mientras están en modo disponible.{'\n\n'}
            <Text style={styles.bold}>Datos de pago:</Text> Información de tarjeta de crédito/débito (procesada y almacenada exclusivamente por Stripe Inc. — B-Ride no almacena datos de tarjeta).{'\n\n'}
            <Text style={styles.bold}>Datos del vehículo (conductores):</Text> Marca, modelo, año, matrícula, color, fotografía del vehículo, licencia de conducir.{'\n\n'}
            <Text style={styles.bold}>Datos de uso:</Text> Historial de viajes, calificaciones, reportes de incidencias, preferencias de notificación.{'\n\n'}
            <Text style={styles.bold}>Datos técnicos:</Text> Identificador de dispositivo, tipo de dispositivo, sistema operativo, tokens de notificación push.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['purpose'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>2. Finalidad del Tratamiento</Text>
          <Text style={styles.body}>
            • Prestación del servicio de intermediación de transporte{'\n'}
            • Conexión entre pasajeros y conductores mediante geolocalización{'\n'}
            • Procesamiento seguro de pagos y transferencias{'\n'}
            • Gestión del sistema de pujas y negociación de tarifas{'\n'}
            • Verificación de identidad y prevención de fraude{'\n'}
            • Seguridad del usuario (sistema SOS, compartir viaje){'\n'}
            • Comunicaciones relacionadas con el servicio (notificaciones push){'\n'}
            • Mejora del servicio y resolución de incidencias{'\n'}
            • Cumplimiento de obligaciones legales y fiscales
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['legal_basis'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>3. Base Legal del Tratamiento</Text>
          <Text style={styles.body}>
            El tratamiento de tus datos se fundamenta en:{'\n\n'}
            <Text style={styles.bold}>Ejecución de contrato (Art. 6.1.b RGPD):</Text> El tratamiento es necesario para la prestación del servicio de intermediación de transporte que solicitas al usar B-Ride.{'\n\n'}
            <Text style={styles.bold}>Interés legítimo (Art. 6.1.f RGPD):</Text> Prevención de fraude, seguridad de la plataforma y mejora del servicio.{'\n\n'}
            <Text style={styles.bold}>Consentimiento (Art. 6.1.a RGPD):</Text> Para comunicaciones promocionales y uso de ubicación en segundo plano.{'\n\n'}
            <Text style={styles.bold}>Obligación legal (Art. 6.1.c RGPD):</Text> Conservación de datos para cumplimiento fiscal y regulatorio.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['retention'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>4. Plazo de Conservación</Text>
          <Text style={styles.body}>
            • <Text style={styles.bold}>Datos de cuenta:</Text> Mientras la cuenta esté activa + 30 días tras la eliminación{'\n'}
            • <Text style={styles.bold}>Historial de viajes:</Text> 3 años desde la fecha del viaje{'\n'}
            • <Text style={styles.bold}>Datos de ubicación:</Text> 90 días (datos en tiempo real se eliminan al finalizar cada viaje){'\n'}
            • <Text style={styles.bold}>Datos de pago:</Text> Según la política de retención de Stripe (cumplimiento PCI-DSS){'\n'}
            • <Text style={styles.bold}>Logs de auditoría:</Text> 5 años (obligación legal){'\n'}
            • <Text style={styles.bold}>Reportes de seguridad:</Text> 2 años desde la resolución
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['rights'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>5. Derechos del Usuario</Text>
          <Text style={styles.body}>
            Conforme al RGPD y legislación aplicable, tienes derecho a:{'\n\n'}
            ✅ <Text style={styles.bold}>Acceso:</Text> Solicitar una copia de todos tus datos personales{'\n'}
            ✅ <Text style={styles.bold}>Rectificación:</Text> Corregir datos inexactos o incompletos{'\n'}
            ✅ <Text style={styles.bold}>Supresión ("derecho al olvido"):</Text> Solicitar la eliminación de tus datos{'\n'}
            ✅ <Text style={styles.bold}>Portabilidad:</Text> Recibir tus datos en formato estructurado y legible por máquina{'\n'}
            ✅ <Text style={styles.bold}>Oposición:</Text> Oponerte al tratamiento de tus datos{'\n'}
            ✅ <Text style={styles.bold}>Limitación:</Text> Restringir el tratamiento en ciertos casos{'\n'}
            ✅ <Text style={styles.bold}>Retirada del consentimiento:</Text> En cualquier momento, sin efecto retroactivo{'\n\n'}
            Para ejercer estos derechos, contacta a: dpo@b-ride.com{'\n'}
            Plazo de respuesta: máximo 30 días naturales.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['controller'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>6. Responsable del Tratamiento</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>Razón social:</Text> [NOMBRE DE LA EMPRESA OPERADORA]{'\n'}
            <Text style={styles.bold}>Domicilio:</Text> [DIRECCIÓN FISCAL]{'\n'}
            <Text style={styles.bold}>CIF/NIF:</Text> [IDENTIFICACIÓN FISCAL]{'\n'}
            <Text style={styles.bold}>Email de contacto:</Text> contacto@b-ride.com{'\n'}
            <Text style={styles.bold}>Delegado de Protección de Datos:</Text> dpo@b-ride.com{'\n\n'}
            Autoridad de control competente: Agencia Española de Protección de Datos (AEPD) o equivalente según jurisdicción.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['transfers'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>7. Transferencias Internacionales</Text>
          <Text style={styles.body}>
            Tus datos de pago son procesados por <Text style={styles.bold}>Stripe Inc.</Text>, con sede en Estados Unidos. Stripe cumple con el EU-US Data Privacy Framework y aplica Cláusulas Contractuales Tipo (SCCs) aprobadas por la Comisión Europea para garantizar un nivel adecuado de protección de datos.{'\n\n'}
            Los servidores de aplicación pueden ubicarse en infraestructura cloud (Railway, AWS, GCP) con centros de datos en la UE cuando esté disponible.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['cookies'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>8. Almacenamiento Local</Text>
          <Text style={styles.body}>
            B-Ride utiliza AsyncStorage (almacenamiento local del dispositivo) para:{'\n\n'}
            • Token de sesión (autenticación){'\n'}
            • Preferencias del usuario (idioma, tema, notificaciones){'\n'}
            • Aceptación de términos legales{'\n'}
            • Cache de datos de onboarding{'\n\n'}
            Estos datos se almacenan exclusivamente en tu dispositivo y se eliminan al cerrar sesión o desinstalar la app. No se utilizan cookies de terceros ni tecnologías de tracking publicitario.
          </Text>
        </View>

        {/* ══════════ TÉRMINOS Y CONDICIONES ══════════ */}
        <View onLayout={e => sectionPositions.current['terms'] = e.nativeEvent.layout.y}>
          <Text style={styles.sectionHeader}>TÉRMINOS Y CONDICIONES</Text>
        </View>

        <View onLayout={e => sectionPositions.current['bids'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>9. Sistema de Pujas</Text>
          <Text style={styles.body}>
            B-Ride utiliza un sistema de pujas donde:{'\n\n'}
            • El pasajero solicita un viaje indicando un precio propuesto{'\n'}
            • Los conductores cercanos pueden enviar contraofertas (pujas){'\n'}
            • Cada puja tiene una validez de 25 segundos{'\n'}
            • El pasajero es libre de aceptar o rechazar cualquier puja{'\n'}
            • Una vez aceptada una puja, el precio es vinculante para ambas partes{'\n'}
            • B-Ride no garantiza la disponibilidad de conductores ni un precio determinado{'\n'}
            • Los precios son resultado de la libre negociación entre pasajero y conductor{'\n'}
            • B-Ride se reserva el derecho de rechazar precios que se consideren abusivos o fraudulentos
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['commission'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>10. Comisión de la Plataforma</Text>
          <Text style={styles.body}>
            B-Ride cobra una comisión del <Text style={styles.bold}>15%</Text> sobre el precio final acordado de cada viaje. Esta comisión:{'\n\n'}
            • Se descuenta automáticamente del monto transferido al conductor{'\n'}
            • Cubre los costos de operación: servidores, soporte, procesamiento de pagos, seguro{'\n'}
            • Es informada al conductor antes de aceptar su primera puja{'\n'}
            • Los conductores reciben el 85% del precio acordado{'\n'}
            • Stripe cobra adicionalmente su tarifa estándar de procesamiento (≈2.9% + $0.30)
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['cancellations'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>11. Política de Cancelaciones</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>Antes de la aceptación:</Text> Ambas partes pueden cancelar sin cargo.{'\n\n'}
            <Text style={styles.bold}>Después de la aceptación por el pasajero:</Text>{'\n'}
            • Ventana de gracia: 2 minutos sin cargo{'\n'}
            • Después de 2 minutos: tarifa de cancelación del 15% del precio acordado (mínimo $2.00){'\n'}
            • La tarifa compensa al conductor por el tiempo y desplazamiento{'\n\n'}
            <Text style={styles.bold}>Cancelación por el conductor:</Text> Sin cargo para el pasajero. Las cancelaciones reiteradas por parte del conductor afectan su tasa de aceptación y pueden resultar en suspensión.{'\n\n'}
            <Text style={styles.bold}>Cancelaciones fraudulentas:</Text> B-Ride se reserva el derecho de suspender cuentas que muestren patrones de cancelación abusiva.
          </Text>
        </View>

        <View onLayout={e => sectionPositions.current['liability'] = e.nativeEvent.layout.y}>
          <Text style={styles.section}>12. Responsabilidad y Limitaciones</Text>
          <Text style={styles.body}>
            • B-Ride actúa como intermediario tecnológico entre pasajeros y conductores independientes{'\n'}
            • B-Ride no es una empresa de transporte y no emplea directamente a los conductores{'\n'}
            • Cada conductor es responsable de mantener su vehículo en condiciones legales y seguras{'\n'}
            • B-Ride no garantiza la disponibilidad del servicio 24/7{'\n'}
            • B-Ride verifica la documentación de los conductores pero no puede garantizar la veracidad de toda la información proporcionada{'\n'}
            • El uso del botón SOS conecta con servicios de emergencia locales; B-Ride no puede garantizar tiempos de respuesta{'\n'}
            • B-Ride no es responsable de objetos perdidos, aunque facilitará la comunicación entre las partes{'\n\n'}
            <Text style={styles.bold}>Resolución de conflictos:</Text> En caso de disputa, B-Ride ofrece un sistema de mediación interna a través de los reportes post-viaje. Si la mediación no resuelve el conflicto, las partes pueden acudir a los tribunales competentes.
          </Text>
        </View>

        <Text style={[styles.body, { marginTop: 24, textAlign: 'center', fontStyle: 'italic' }]}>
          Al pulsar "Aceptar", confirmo que he leído y acepto la Política de Privacidad y los Términos y Condiciones de B-Ride.
        </Text>

        {onAccept && (
          <TouchableOpacity
            style={[styles.acceptBtn, !hasScrolledToEnd && styles.acceptBtnDisabled]}
            onPress={handleAccept}
            disabled={!hasScrolledToEnd}
          >
            <Text style={styles.acceptBtnText}>
              {hasScrolledToEnd ? 'Aceptar y continuar' : 'Lee hasta el final para aceptar ↓'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Leer si el usuario ya aceptó */
export async function hasAcceptedLegal(): Promise<boolean> {
  const val = await AsyncStorage.getItem(LEGAL_ACCEPTED_KEY);
  return !!val;
}

const getStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 80, paddingTop: Platform.OS === 'ios' ? 20 : 40 },
  title: { ...theme.typography.header, fontSize: 24, marginBottom: 8 },
  updated: { ...theme.typography.bodyMuted, fontSize: 12, marginBottom: 20 },
  indexBox: {
    backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: 28,
  },
  indexTitle: { ...theme.typography.title, fontSize: 16, marginBottom: 12 },
  indexItem: { paddingVertical: 6 },
  indexText: { ...theme.typography.body, fontSize: 14, color: theme.colors.link },
  sectionHeader: {
    fontSize: 20, fontWeight: '900', color: theme.colors.primary,
    marginTop: 32, marginBottom: 16, letterSpacing: 1,
    borderBottomWidth: 2, borderBottomColor: theme.colors.primary, paddingBottom: 8,
  },
  section: { ...theme.typography.title, fontSize: 16, marginTop: 24, marginBottom: 10, color: theme.colors.primary },
  body: { ...theme.typography.body, fontSize: 14, lineHeight: 22, color: theme.colors.textMuted },
  bold: { fontWeight: '700', color: theme.colors.text },
  acceptBtn: {
    backgroundColor: theme.colors.primary, padding: 18, borderRadius: 30,
    alignItems: 'center', marginTop: 32,
  },
  acceptBtnDisabled: { opacity: 0.4 },
  acceptBtnText: { ...theme.typography.button, fontSize: 16 },
});
