import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { FastMoneyInput } from './ui/FastMoneyInput';
import { showAlert } from './ui/AlertModal';
import { StoreHistoryLockNotice } from './ui/StoreHistoryLockNotice';
import {
  canCreateCustomer,
  createCustomer,
  findCustomerByDocument,
  linkCustomerToStore,
} from '../services/customers';
import { fetchProfile } from '../services/profile';
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
  const navigation = useNavigation<any>();
  const { isSmall, isTablet } = useResponsive();
  const queryClient = useQueryClient();
  const profileFromStore = useStore(s => s.profile);
  const { data: profileQuery } = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    staleTime: 60000,
  });
  const profile = profileQuery || profileFromStore;
  const subStatus = calculateSubscriptionStatus(profile);
  const hasProAccess =
    Boolean(profile?.subscription_plan && profile.subscription_plan.toLowerCase() !== 'free') &&
    (subStatus.effectivePlan !== 'free' ||
      subStatus.inGracePeriod ||
      !subStatus.isDowngradedToFree ||
      (profile?.subscription_status || '').toLowerCase() === 'active');

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
    const val = value.replace(/[^0-9]/g, '');
    setDocumentNumber(val);
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
    if (!visible) return;
    const onBackPress = () => {
      if (showTypePicker) {
        setShowTypePicker(false);
        return true;
      }
      resetForm();
      onClose();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [visible, showTypePicker, onClose]);

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

  const matchedCustomer = React.useMemo(() => {
    const docClean = (documentNumber || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!docClean && !foundCustomer) return null;
    return existingCustomers.find(c => {
      const cDocClean = (c.document_number || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const matchDoc = Boolean(docClean && cDocClean && docClean === cDocClean);
      const matchId = Boolean(
        foundCustomer && (
          (c.id && (c.id === foundCustomer.id || c.id === foundCustomer.server_id || c.id === foundCustomer.local_id)) ||
          (c.server_id && (c.server_id === foundCustomer.id || c.server_id === foundCustomer.server_id)) ||
          (c.local_id && (c.local_id === foundCustomer.id || c.local_id === foundCustomer.local_id))
        )
      );
      return matchDoc || matchId;
    });
  }, [foundCustomer, documentNumber, existingCustomers]);

  const isAlreadyLinked = Boolean(
    foundCustomer?.isLinkedToMyStore || matchedCustomer,
  );
  const targetCustomer = matchedCustomer || foundCustomer;

  async function onCheckDocument() {
    if (!documentNumber.trim()) {
      return showAlert('Faltan datos', 'Ingresa la identificación del cliente');
    }
    setCheckingDocument(true);
    try {
      const customer = await findCustomerByDocument(documentNumber.trim());
      setFoundCustomer(customer);
      setVerified(true);
      const docClean = documentNumber.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const localMatch = existingCustomers.find(c => {
        const cDocClean = (c.document_number || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
        return Boolean(docClean && cDocClean && docClean === cDocClean);
      });
      const target = localMatch || customer;
      if (target) {
        setName(target.name);
        setPhone(target.phone ?? '');
        setEmail(target.email ?? '');
        if (target.credit_limit) {
          setCreditLimit(FormatMoney(String(target.credit_limit)));
        }
        if (target.alias) {
          setAlias(target.alias);
        }
      } else {
        setName('');
      }
    } catch (error: any) {
      showAlert('No se pudo verificar', error?.message ?? 'Intenta de nuevo');
    } finally {
      setCheckingDocument(false);
    }
  }

  async function onCreate() {
    if (isAlreadyLinked) {
      return;
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

  if (!visible) return null;

  return (
    <View style={styles.fullscreenOverlay}>
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
                <View style={{ width: isSmall ? 90 : 110, minWidth: 85 }}>
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
                    keyboardType="numeric"
                    returnKeyType="search"
                    onSubmitEditing={() => {
                      if (!checkingDocument && documentNumber.trim()) {
                        onCheckDocument();
                      }
                    }}
                    placeholder="123456789"
                    trailingElement={
                      <TouchableOpacity
                        onPress={onCheckDocument}
                        disabled={checkingDocument || !documentNumber.trim()}
                        style={[
                          styles.searchDocBtn,
                          (!documentNumber.trim() || checkingDocument) &&
                          styles.searchDocBtnDisabled,
                        ]}>
                        <Ionicons
                          name="search-outline"
                          size={16}
                          color={
                            !documentNumber.trim() || checkingDocument
                              ? Colors.primary
                              : '#FFFFFF'
                          }
                        />
                        <Text
                          style={[
                            styles.searchDocBtnText,
                            (!documentNumber.trim() || checkingDocument) &&
                            styles.searchDocBtnTextDisabled,
                          ]}>
                          Buscar
                        </Text>
                      </TouchableOpacity>
                    }
                  />
                </View>
              </View>

              <Button
                title={checkingDocument ? 'Verificando...' : 'Buscar en Tenderito'}
                variant="secondary"
                onPress={onCheckDocument}
                disabled={checkingDocument || !documentNumber.trim()}
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
                  {isAlreadyLinked && targetCustomer ? (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        const custId = targetCustomer.id || targetCustomer.server_id || targetCustomer.local_id;
                        resetForm();
                        onClose();
                        navigation.navigate('CustomerDetail', {
                          id: custId,
                        });
                      }}
                      style={styles.alreadyLinkedCard}>
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
                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={Colors.primary}
                        />
                      </View>
                      <View style={styles.alreadyLinkedDivider} />
                      <View style={styles.alreadyLinkedInfo}>
                        <Text style={styles.alreadyLinkedName}>
                          {targetCustomer.alias || targetCustomer.name}
                        </Text>
                        <Text style={styles.alreadyLinkedSub}>
                          {targetCustomer.document_type || 'CC'}{' '}
                          {targetCustomer.document_number} ·{' '}
                          {targetCustomer.phone || 'Sin teléfono'}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: Colors.primary }}>
                            Ver cartera y detalles
                          </Text>
                          <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  ) : foundCustomer ? (
                    <>
                      <Card style={{ gap: 4 }}>
                        <Text style={styles.name}>{foundCustomer.name}</Text>
                        <Text style={styles.sub}>
                          {foundCustomer.phone ?? 'Sin teléfono'}
                        </Text>
                        <Text style={styles.sub}>
                          Cliente registrado en Tenderito
                        </Text>
                        {hasProAccess ? (
                          <Button
                            title="Ver historial entre tiendas"
                            variant="ghost"
                            onPress={() => {
                              navigation.navigate('CustomerHistory', {
                                id: foundCustomer.id,
                                customer: foundCustomer,
                              });
                            }}
                          />
                        ) : (
                          <StoreHistoryLockNotice />
                        )}
                      </Card>
                      <FastMoneyInput
                        label="Tope de crédito"
                        value={creditLimit}
                        onChangeAmount={(_num, formatted) => setCreditLimit(formatted)}
                        placeholder="$ 0"
                      />
                      <Input
                        label="Alias para mi tienda (opcional)"
                        value={alias}
                        onChangeText={setAlias}
                        placeholder="Ej. Juan de la esquina"
                      />
                    </>
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
                      <FastMoneyInput
                        label="Tope de crédito"
                        value={creditLimit}
                        onChangeAmount={(_num, formatted) => setCreditLimit(formatted)}
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
                isAlreadyLinked && targetCustomer ? (
                  <View style={{ gap: 8 }}>
                    <Button
                      title="Usar este cliente"
                      onPress={() => {
                        const cust = targetCustomer;
                        const custId = cust?.id || cust?.server_id || cust?.local_id;
                        resetForm();
                        onClose();
                        if (onCustomerCreated && cust) {
                          onCustomerCreated(cust);
                        }
                        navigation.navigate('NewCredit', {
                          customerId: custId,
                          customer: cust,
                        });
                      }}
                    />
                    <Button
                      title="Ver detalles del cliente"
                      variant="secondary"
                      onPress={() => {
                        const custId = targetCustomer?.id || targetCustomer?.server_id || targetCustomer?.local_id;
                        resetForm();
                        onClose();
                        navigation.navigate('CustomerDetail', {
                          id: custId,
                        });
                      }}
                    />
                  </View>
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
                title={isAlreadyLinked ? 'Cerrar' : 'Volver atrás'}
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
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    backgroundColor: Colors.background,
    elevation: 10,
  },
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
  searchDocBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  searchDocBtnDisabled: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  searchDocBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  searchDocBtnTextDisabled: {
    color: Colors.primary,
  },
});

