import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { showAlert } from './ui/AlertModal';
import { StoreHistoryLockNotice } from './ui/StoreHistoryLockNotice';
import {
  canCreateCustomer,
  createCustomer,
  findCustomerByDocument,
  linkCustomerToStore,
} from '../services/customers';
import { useStore } from '../store/useStore';
import { calculateSubscriptionStatus } from '../services/plans';
import { Colors, formatCOP } from '../theme';
import { FormatMoney, parseMoney } from '../utils/format';
import { useResponsive } from '../hooks/useResponsive';
import type { Customer } from '../types';

export const DOCUMENT_TYPES = [
  { value: 'CC', label: 'CC · Cédula de ciudadanía' },
  { value: 'CE', label: 'CE · Cédula de extranjería' },
  { value: 'NIT', label: 'NIT · Número tributario' },
  { value: 'PAS', label: 'PAS · Pasaporte' },
  { value: 'PEP', label: 'PEP · Permiso especial' },
  { value: 'PPT', label: 'PPT · Permiso protección temporal' },
];

interface CreateCustomerModalProps {
  visible: boolean;
  onClose: () => void;
  onCustomerCreated?: (customer: Customer) => void;
  existingCustomers?: Customer[];
}

export function CreateCustomerModal({
  visible,
  onClose,
  onCustomerCreated,
  existingCustomers = [],
}: CreateCustomerModalProps) {
  const insets = useSafeAreaInsets();
  const { isSmall, isTablet } = useResponsive();
  const queryClient = useQueryClient();
  const profile = useStore(s => s.profile);
  const subStatus = calculateSubscriptionStatus(profile);

  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('CC');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [creditLimit, setCreditLimit] = useState('0');
  const [alias, setAlias] = useState('');
  const [foundCustomer, setFoundCustomer] = useState<any>(null);
  const [verified, setVerified] = useState(false);
  const [checkingDocument, setCheckingDocument] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  function resetForm() {
    setName('');
    setDocumentType('CC');
    setShowTypePicker(false);
    setDocumentNumber('');
    setPhone('');
    setEmail('');
    setCreditLimit('0');
    setAlias('');
    setFoundCustomer(null);
    setVerified(false);
    fadeAnim.setValue(0);
    slideAnim.setValue(12);
  }

  function handleDocumentChange(value: string) {
    setDocumentNumber(value);
    if (verified) {
      setVerified(false);
      setFoundCustomer(null);
    }
  }

  function handleTypeSelect(value: string) {
    setDocumentType(value);
    setShowTypePicker(false);
    if (verified) {
      setVerified(false);
      setFoundCustomer(null);
    }
  }

  function handleCreditLimitChange(text: string) {
    if (!text || text === '' || text === '$ ' || text === '$') {
      setCreditLimit('0');
      return;
    }
    setCreditLimit(FormatMoney(text));
  }

  useEffect(() => {
    if (verified) {
      fadeAnim.setValue(0);
      slideAnim.setValue(12);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [verified, fadeAnim, slideAnim]);

  const isAlreadyLinked = React.useMemo(() => {
    if (!foundCustomer) return false;
    if (foundCustomer.isLinkedToMyStore) return true;
    const docClean = (documentNumber || '').trim();
    return existingCustomers.some(
      c =>
        (c.document_number && c.document_number.trim() === docClean) ||
        c.id === foundCustomer.id,
    );
  }, [foundCustomer, documentNumber, existingCustomers]);

  async function onCheckDocument() {
    if (!documentNumber.trim()) {
      return showAlert('Faltan datos', 'Ingresa la identificación del cliente');
    }
    setCheckingDocument(true);
    try {
      const customer = await findCustomerByDocument(documentNumber.trim());
      setFoundCustomer(customer);
      setVerified(true);
      if (customer) {
        setName(customer.name);
        setPhone(customer.phone ?? '');
        setEmail(customer.email ?? '');

        const alreadyLinked =
          customer.isLinkedToMyStore ||
          existingCustomers.some(
            c =>
              (c.document_number &&
                c.document_number.trim() === documentNumber.trim()) ||
              c.id === customer.id,
          );

        if (alreadyLinked) {
          showAlert({
            title: 'Cliente ya vinculado',
            message: `"${customer.alias || customer.name}" ya se encuentra registrado y vinculado a tu tienda.`,
            type: 'warning',
          });
        } else {
          showAlert(
            'Cliente encontrado',
            'El cliente está registrado en Tenderito. Revisa sus datos y define el tope de crédito para vincularlo a tu tienda.',
          );
        }
      } else {
        setName('');
        showAlert('Cliente nuevo', 'Completa los datos para registrarlo.');
      }
    } catch (error: any) {
      showAlert('No se pudo verificar', error?.message ?? 'Intenta de nuevo');
    } finally {
      setCheckingDocument(false);
    }
  }

  async function onCreate() {
    const check = await canCreateCustomer(profile);
    if (!check.allowed) {
      return showAlert({
        title: 'Límite de clientes alcanzado',
        message: `Tu plan ${check.effectivePlan.toUpperCase()} permite hasta ${check.limit} clientes y ya tienes ${check.count}. Pásate a un plan superior para seguir agregando clientes.`,
        type: 'warning',
        buttons: [{ text: 'Entendido', style: 'cancel' }],
      });
    }

    if (foundCustomer) {
      if (!documentNumber.trim()) {
        return showAlert('Faltan datos', 'Identificación es obligatoria');
      }
    } else if (!name.trim() || !documentNumber.trim() || !phone.trim()) {
      return showAlert(
        'Faltan datos',
        'Nombre, identificación y teléfono son obligatorios',
      );
    }

    try {
      let createdResult: Customer;
      if (foundCustomer) {
        await linkCustomerToStore(
          foundCustomer,
          parseMoney(creditLimit),
          alias,
        );
        createdResult = {
          ...foundCustomer,
          alias: alias?.trim() || foundCustomer.alias || null,
          credit_limit: parseMoney(creditLimit),
        };
        showAlert(
          'Cliente vinculado',
          `"${alias?.trim() || foundCustomer.name}" ha sido vinculado a tu tienda exitosamente.`,
        );
      } else {
        createdResult = await createCustomer({
          name: name.trim(),
          document_type: documentType.trim().toUpperCase(),
          document_number: documentNumber.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          credit_limit: parseMoney(creditLimit),
          alias: alias.trim() || null,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-all'] });
      resetForm();
      onClose();
      onCustomerCreated?.(createdResult);
    } catch (error: any) {
      showAlert('No se pudo guardar', error?.message ?? 'Intenta de nuevo');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        resetForm();
        onClose();
      }}>
      <View
        style={[
          styles.sheet,
          isTablet && { maxWidth: 560, width: '100%', alignSelf: 'center', borderRadius: 24, marginVertical: 32 },
        ]}>
        <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable
            onPress={() => {
              resetForm();
              onClose();
            }}
            style={styles.backButton}
            hitSlop={8}>
            <Text style={styles.backText}>‹ Volver</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Nuevo cliente</Text>
          <View style={{ width: 64 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ width: isSmall ? 85 : 110 }}>
                  <Text style={styles.label}>Tipo</Text>
                  <Pressable
                    onPress={() => setShowTypePicker(true)}
                    style={styles.pickerButton}>
                    <Text style={styles.pickerValue}>{documentType}</Text>
                    <Text style={styles.pickerChevron}>▾</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Identificación"
                    value={documentNumber}
                    onChangeText={handleDocumentChange}
                    keyboardType="number-pad"
                    placeholder="123456789"
                  />
                </View>
              </View>

              <Button
                title={checkingDocument ? 'Verificando...' : 'Verificar cédula'}
                variant="secondary"
                onPress={onCheckDocument}
                disabled={checkingDocument}
              />

              {!verified ? (
                <Text style={styles.hint}>
                  Verifica la cédula para continuar con el registro.
                </Text>
              ) : (
                <Animated.View
                  style={{
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                    gap: 12,
                  }}>
                  {foundCustomer ? (
                    isAlreadyLinked ? (
                      <View style={styles.alreadyLinkedCard}>
                        <View style={styles.alreadyLinkedHeader}>
                          <View style={styles.alreadyLinkedIconWrap}>
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color="#15803D"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.alreadyLinkedTitle}>
                              Cliente ya vinculado a tu tienda
                            </Text>
                            <Text style={styles.alreadyLinkedDesc}>
                              Este cliente ya forma parte de tu libreta de fiados.
                            </Text>
                          </View>
                        </View>
                        <View style={styles.alreadyLinkedDivider} />
                        <View style={styles.alreadyLinkedInfo}>
                          <Text style={styles.alreadyLinkedName}>
                            {foundCustomer.alias || foundCustomer.name}
                          </Text>
                          <Text style={styles.alreadyLinkedSub}>
                            {foundCustomer.document_type || 'CC'}{' '}
                            {foundCustomer.document_number} ·{' '}
                            {foundCustomer.phone || 'Sin teléfono'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Card style={{ gap: 4 }}>
                          <Text style={styles.name}>{foundCustomer.name}</Text>
                          <Text style={styles.sub}>
                            {foundCustomer.phone ?? 'Sin teléfono'}
                          </Text>
                          <Text style={styles.sub}>
                            Cliente registrado en Tenderito
                          </Text>
                          {subStatus.effectivePlan === 'free' ? (
                            <StoreHistoryLockNotice />
                          ) : null}
                        </Card>
                        <Input
                          label="Tope de crédito"
                          value={creditLimit ? FormatMoney(creditLimit) : '$ 0'}
                          onChangeText={handleCreditLimitChange}
                          keyboardType="numeric"
                          placeholder="$ 0"
                        />
                        <Input
                          label="Alias para mi tienda (opcional)"
                          value={alias}
                          onChangeText={setAlias}
                          placeholder="Ej. Juan de la esquina"
                        />
                      </>
                    )
                  ) : (
                    <>
                      <Input
                        label="Nombre completo"
                        value={name}
                        onChangeText={setName}
                        placeholder="Nombre del cliente"
                      />
                      <Input
                        label="Teléfono"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        placeholder="300 123 4567"
                      />
                      <Input
                        label="Correo electrónico (opcional)"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        placeholder="cliente@correo.com"
                      />
                      <Input
                        label="Tope de crédito"
                        value={creditLimit ? FormatMoney(creditLimit) : '$ 0'}
                        onChangeText={handleCreditLimitChange}
                        keyboardType="numeric"
                        placeholder="$ 0"
                      />
                      <Input
                        label="Alias para mi tienda (opcional)"
                        value={alias}
                        onChangeText={setAlias}
                        placeholder="Ej. Juan de la esquina"
                      />
                    </>
                  )}
                </Animated.View>
              )}
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                { paddingBottom: insets.bottom + 12 },
              ]}>
              {verified ? (
                isAlreadyLinked ? (
                  <Button
                    title="Usar este cliente"
                    onPress={() => {
                      resetForm();
                      onClose();
                      onCustomerCreated?.(foundCustomer);
                    }}
                  />
                ) : (
                  <Button
                    title={
                      foundCustomer
                        ? 'Vincular cliente a mi tienda'
                        : 'Guardar cliente'
                    }
                    onPress={onCreate}
                  />
                )
              ) : null}
              <Button
                title="Cancelar"
                variant="ghost"
                onPress={() => {
                  resetForm();
                  onClose();
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <Modal
        visible={showTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypePicker(false)}>
        <Pressable
          style={styles.overlay}
          onPress={() => setShowTypePicker(false)}>
          <Pressable onPress={e => e.stopPropagation?.()}>
            <Card style={{ gap: 4, minWidth: 280 }}>
              <Text style={styles.sheetTitle}>Tipo documento</Text>
              {DOCUMENT_TYPES.map(item => (
                <Pressable
                  key={item.value}
                  onPress={() => handleTypeSelect(item.value)}
                  style={[
                    styles.typeOption,
                    item.value === documentType && styles.typeOptionSelected,
                  ]}>
                  <Text
                    style={[
                      styles.typeOptionText,
                      item.value === documentType &&
                        styles.typeOptionTextSelected,
                    ]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
              <Button
                title="Cerrar"
                variant="ghost"
                onPress={() => setShowTypePicker(false)}
              />
            </Card>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  sheetContent: { padding: 20, gap: 14 },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hint: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.card,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  pickerValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  pickerChevron: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '700',
  },
  modalFooter: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  alreadyLinkedCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  alreadyLinkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alreadyLinkedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alreadyLinkedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803D',
  },
  alreadyLinkedDesc: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
  },
  alreadyLinkedDivider: {
    height: 1,
    backgroundColor: '#DCFCE7',
  },
  alreadyLinkedInfo: {
    gap: 4,
  },
  alreadyLinkedName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  alreadyLinkedSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  typeOptionSelected: {
    backgroundColor: Colors.primary + '15',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  typeOptionTextSelected: {
    color: Colors.primary,
    fontWeight: '800',
  },
  historyNoticeWrap: {
    marginTop: 4,
  },
  historyLockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  lockButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockEmoji: {
    fontSize: 14,
  },
  historyLockedText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    lineHeight: 16,
  },
  tooltipBox: {
    marginTop: 8,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  tooltipArrow: {
    position: 'absolute',
    top: -6,
    left: 18,
    width: 12,
    height: 12,
    backgroundColor: '#1E293B',
    transform: [{ rotate: '45deg' }],
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  tooltipDesc: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
  },
});

