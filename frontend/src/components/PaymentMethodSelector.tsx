import { useAppTheme } from '../hooks/useAppTheme';
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from 'react-native';
import { theme } from '../theme';
import { useRideFlowStore } from '../store/useRideFlowStore';
import { CreditCard, Banknote, Apple, Wallet, Building2, Store } from 'lucide-react-native';
import { useTranslation } from '../hooks/useTranslation';
import client from '../api/client';

const { width } = Dimensions.get('window');

interface PaymentMethodSelectorProps {
  onSelected?: () => void;
}

export default function PaymentMethodSelector({
 onSelected }: PaymentMethodSelectorProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { t } = useTranslation();

  const [modalVisible, setModalVisible] = useState(false);
  const paymentMethod = useRideFlowStore(state => state.paymentMethod);
  const setPaymentMethod = useRideFlowStore(state => state.setPaymentMethod);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  React.useEffect(() => {
    if (modalVisible) {
      client.get('/wallet/balance').then(res => {
        if (res.data.success) setWalletBalance(res.data.data.balance);
      }).catch(() => {});
    }
  }, [modalVisible]);

  const selectMethod = (method: 'CASH' | 'CARD' | 'APPLE_PAY' | 'WALLET' | 'OXXO' | 'SPEI') => {
    setPaymentMethod(method);
    setModalVisible(false);
    if (onSelected) onSelected();
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'CASH': return t('payment.cash');
      case 'CARD': return t('payment.creditCard');
      case 'APPLE_PAY': return 'Apple Pay';
      case 'WALLET': return 'Billetera (Wallet)';
      case 'OXXO': return 'OXXO Pay';
      case 'SPEI': return 'Transferencia SPEI';
      default: return t('payment.selectPayment');
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH': return <Banknote size={20} color={theme.colors.success} />;
      case 'CARD': return <CreditCard size={20} color={theme.colors.primary} />;
      case 'APPLE_PAY': return <Apple size={20} color={theme.colors.text} />;
      case 'WALLET': return <Wallet size={20} color={theme.colors.gold || '#F5C518'} />;
      case 'OXXO': return <Store size={20} color="#EA2027" />;
      case 'SPEI': return <Building2 size={20} color="#0652DD" />;
      default: return <CreditCard size={20} color={theme.colors.textSecondary} />;
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.selectorBtn} onPress={() => setModalVisible(true)}>
        <View style={styles.leftRow}>
          {getMethodIcon(paymentMethod)}
          <Text style={styles.selectorText}>{getMethodLabel(paymentMethod)}</Text>
        </View>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.sheetTitle}>{t('payment.methodSelectTitle')}</Text>

            <TouchableOpacity style={styles.methodOption} onPress={() => selectMethod('CASH')}>
              <Banknote size={24} color={theme.colors.success} />
              <Text style={styles.methodText}>{t('payment.cash')}</Text>
              {paymentMethod === 'CASH' && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.methodOption} onPress={() => selectMethod('CARD')}>
              <CreditCard size={24} color={theme.colors.primary} />
              <Text style={styles.methodText}>{t('payment.creditCard')}</Text>
              {paymentMethod === 'CARD' && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.methodOption} onPress={() => selectMethod('WALLET')}>
              <Wallet size={24} color={theme.colors.gold || '#F5C518'} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.methodText, { marginLeft: 0 }]}>B-Ride Wallet</Text>
                {walletBalance !== null && (
                  <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                    Saldo: ${walletBalance.toFixed(2)}
                  </Text>
                )}
              </View>
              {paymentMethod === 'WALLET' && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.methodOption} onPress={() => selectMethod('OXXO')}>
              <Store size={24} color="#EA2027" />
              <Text style={styles.methodText}>OXXO Pay</Text>
              {paymentMethod === 'OXXO' && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.methodOption} onPress={() => selectMethod('SPEI')}>
              <Building2 size={24} color="#0652DD" />
              <Text style={styles.methodText}>Transferencia SPEI</Text>
              {paymentMethod === 'SPEI' && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={[styles.methodOption, styles.applePayOption]} onPress={() => selectMethod('APPLE_PAY')}>
              <View style={styles.applePayInner}>
                <Apple size={24} color={theme.colors.text} />
                <Text style={styles.applePayText}>Pay</Text>
              </View>
              {paymentMethod === 'APPLE_PAY' && <View style={[styles.activeDot, { backgroundColor: theme.colors.text }]} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const getStyles = (theme: any) => StyleSheet.create({
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceHigh,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.m,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorText: {
    ...theme.typography.body,
    fontWeight: '600',
  },
  chevron: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: theme.spacing.xl,
    paddingBottom: 40,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: theme.spacing.l,
  },
  sheetTitle: {
    ...theme.typography.title,
    marginBottom: theme.spacing.l,
  },
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surfaceHigh,
    borderRadius: theme.borderRadius.m,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  methodText: {
    ...theme.typography.body,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  applePayOption: {
    backgroundColor: theme.colors.surfaceHigh,
    borderColor: theme.colors.border,
  },
  applePayInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  applePayText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginLeft: 2,
  },
});
