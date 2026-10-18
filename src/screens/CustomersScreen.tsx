import {useQuery} from '@tanstack/react-query';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {Input} from '../components/ui/Input';
import {showAlert} from '../components/ui/AlertModal';
import Ionicons from '@react-native-vector-icons/ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  canCreateCustomer,
  createCustomer,
  findCustomerByDocument,
  fetchCustomers,
  linkCustomerToStore,
} from '../services/customers';
import {useStore} from '../store/useStore';
import {Colors, Radius, formatCOP} from '../theme';
import {FormatMoney, parseMoney} from '../utils/format';

const DOCUMENT_TYPES = [
  {value: 'CC', label: 'CC · Cédula de ciudadanía'},
  {value: 'CE', label: 'CE · Cédula de extranjería'},
  {value: 'NIT', label: 'NIT · Número tributario'},
  {value: 'PAS', label: 'PAS · Pasaporte'},
  {value: 'PEP', label: 'PEP · Permiso especial'},
  {value: 'PPT', label: 'PPT · Permiso protección temporal'},
];

export function CustomersScreen({navigation}: any) {
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owing' | 'clear'>(
    'all',
  );
  const [modal, setModal] = useState(false);
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
  const insets = useSafeAreaInsets();
  const profile = useStore(s => s.profile);
  const setShowUpgrade = useStore(s => s.setShowUpgradeModal);
  const showUpgrade = useStore(s => s.showUpgradeModal);

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

  const {data, refetch, isLoading} = useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(),
  });

  const isAlreadyLinked = useMemo(() => {
    if (!foundCustomer) {
      return false;
    }
    if (foundCustomer.isLinkedToMyStore) {
      return true;
    }
    const docClean = (documentNumber || '').trim();
    return (data ?? []).some(
      c =>
        (c.document_number && c.document_number.trim() === docClean) ||
        c.id === foundCustomer.id,
    );
  }, [foundCustomer, documentNumber, data]);

  async function onCheckDocument() {
    if (!documentNumber.trim()) {
      return showAlert('Faltan datos', 'Ingresa la cédula del cliente');
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
          (data ?? []).some(
            c =>
              (c.document_number &&
                c.document_number.trim() === documentNumber.trim()) ||
              c.id === customer.id,
          );

        if (alreadyLinked) {
          showAlert({
            title: 'Cliente ya vinculado',
            message: `"${
              customer.alias || customer.name
            }" ya se encuentra registrado y vinculado a tu tienda.`,
            type: 'warning',
            buttons: [
              {
                text: 'Ver detalles',
                onPress: () => {
                  setModal(false);
                  resetForm();
                  navigation.navigate('CustomerDetail', {id: customer.id});
                },
              },
              {text: 'Entendido', style: 'cancel'},
            ],
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
  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CO');
    return (data ?? []).filter(customer => {
      const matchesSearch =
        !query ||
        customer.name.toLocaleLowerCase('es-CO').includes(query) ||
        (customer.alias ?? '').toLocaleLowerCase('es-CO').includes(query) ||
        (customer.document_number ?? '').includes(query) ||
        (customer.phone ?? '').includes(query);
      const hasBalance = Number(customer.current_balance) > 0;
      return (
        matchesSearch &&
        (balanceFilter === 'all' ||
          (balanceFilter === 'owing' ? hasBalance : !hasBalance))
      );
    });
  }, [data, search, balanceFilter]);

  async function onCreate() {
    if (isAlreadyLinked) {
      return showAlert(
        'Cliente ya vinculado',
        'Este cliente ya forma parte de tu tienda.',
        [
          {
            text: 'Ver detalles',
            onPress: () => {
              setModal(false);
              resetForm();
              navigation.navigate('CustomerDetail', {id: foundCustomer?.id});
            },
          },
          {text: 'Cerrar', style: 'cancel'},
        ],
      );
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
      const check = await canCreateCustomer(profile);
      if (!check.allowed) {
        setModal(false);
        setShowUpgrade(true);
        return;
      }
      if (foundCustomer) {
        await linkCustomerToStore(
          foundCustomer.id,
          parseMoney(creditLimit),
          alias,
        );
      } else {
        await createCustomer({
          name: name.trim(),
          document_type: documentType.trim().toUpperCase(),
          document_number: documentNumber.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          credit_limit: parseMoney(creditLimit),
          alias: alias.trim() || null,
        });
      }
      resetForm();
      setModal(false);
      refetch();
    } catch (error: any) {
      showAlert('No se pudo guardar', error?.message ?? 'Intenta de nuevo');
      console.log('Error al guardar cliente', error);
    }
  }

  return (
    <View style={styles.wrap}>
      <Header title="Clientes" subtitle="Busca y gestiona tus fiados" />
      <View style={{paddingHorizontal: 20}}>
        <Input
          placeholder="Nombre, alias, cédula o teléfono"
          value={search}
          onChangeText={setSearch}
          leadingIcon="search"
          returnKeyType="search"
        />
      </View>
      <View style={styles.filterRow}>
        {(
          [
            {key: 'all', label: `Todos · ${data?.length ?? 0}`},
            {
              key: 'owing',
              label: `Con deuda · ${
                (data ?? []).filter(c => Number(c.current_balance) > 0).length
              }`,
            },
            {
              key: 'clear',
              label: `Al día · ${
                (data ?? []).filter(c => Number(c.current_balance) === 0).length
              }`,
            },
          ] as const
        ).map(filter => (
          <Pressable
            key={filter.key}
            onPress={() => setBalanceFilter(filter.key)}
            style={[
              styles.filterChip,
              balanceFilter === filter.key && styles.filterChipActive,
            ]}>
            <Text
              style={[
                styles.filterText,
                balanceFilter === filter.key && styles.filterTextActive,
              ]}>
              {filter.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        contentContainerStyle={{padding: 20, gap: 12, paddingBottom: 96}}
        data={visibleCustomers}
        keyExtractor={i => i.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <Card style={styles.emptyContainer}>
              <Ionicons
                name={search ? 'search-outline' : 'people-outline'}
                size={38}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {search ? 'Sin coincidencias' : 'Sin clientes registrados'}
              </Text>
              <Text style={styles.emptySub}>
                {search
                  ? 'No encontramos clientes con esa búsqueda. Revisa el nombre o escribe la cédula.'
                  : 'Toca el botón "+ Nuevo cliente" abajo para registrar tu primer cliente.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({item}) => {
          const balance = Number(item.current_balance || 0);
          const isOwing = balance > 0;
          return (
            <Pressable
              onPress={() =>
                navigation.navigate('CustomerDetail', {id: item.id})
              }>
              <Card style={styles.customerCardItem}>
                <View style={styles.customerCardMainRow}>
                  <View style={[styles.avatar, !isOwing && styles.avatarPaid]}>
                    <Text
                      style={[
                        styles.avatarText,
                        !isOwing && styles.avatarTextPaid,
                      ]}>
                      {(item.alias || item.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flexOne}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.alias || item.name}
                    </Text>
                    {item.alias ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {item.name}
                      </Text>
                    ) : null}
                    <Text style={styles.sub}>
                      {item.phone ? `📞 ${item.phone}` : 'Sin teléfono'}
                    </Text>
                  </View>
                  <View style={styles.customerCardBalanceCol}>
                    <Text
                      style={[
                        styles.balanceLabel,
                        isOwing
                          ? styles.balanceLabelOwing
                          : styles.balanceLabelPaid,
                      ]}>
                      {isOwing ? 'Te debe' : 'Al día'}
                    </Text>
                    <Text
                      style={[
                        styles.balance,
                        isOwing ? styles.balanceOwing : styles.balancePaid,
                      ]}>
                      {formatCOP(balance)}
                    </Text>
                  </View>
                </View>

                {/* Pastilla indicativa clara para tocar */}
                <View style={styles.cardFooterHint}>
                  <Text style={styles.cardFooterText}>
                    Toca para ver su libreta de cuentas
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={Colors.primary}
                  />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
      <Pressable
        onPress={async () => {
          const check = await canCreateCustomer(profile);
          if (!check.allowed) {
            setShowUpgrade(true);
            return;
          }
          resetForm();
          setModal(true);
        }}
        accessibilityLabel="Nuevo cliente"
        style={({pressed}) => [styles.fab, pressed && styles.fabPressed]}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.fabText}>Nuevo cliente</Text>
      </Pressable>
      <Modal
        visible={modal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModal(false)}>
        <View style={styles.sheet}>
          <View style={[styles.modalHeader, {paddingTop: insets.top + 8}]}>
            <Pressable
              onPress={() => setModal(false)}
              style={styles.backButton}
              hitSlop={8}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>Nuevo cliente</Text>
            <View style={{width: 64}} />
          </View>
          <KeyboardAvoidingView
            style={{flex: 1}}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
            <View style={{flex: 1}}>
              <ScrollView
                style={{flex: 1}}
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={{flexDirection: 'row', gap: 8}}>
                  <View style={{width: 110}}>
                    <Text style={styles.label}>Tipo</Text>
                    <Pressable
                      onPress={() => setShowTypePicker(true)}
                      style={styles.pickerButton}>
                      <Text style={styles.pickerValue}>{documentType}</Text>
                      <Text style={styles.pickerChevron}>▾</Text>
                    </Pressable>
                  </View>
                  <View style={{flex: 1}}>
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
                  title={
                    checkingDocument ? 'Verificando...' : 'Verificar cédula'
                  }
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
                      transform: [{translateY: slideAnim}],
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
                            <View style={{flex: 1}}>
                              <Text style={styles.alreadyLinkedTitle}>
                                Cliente ya vinculado a tu tienda
                              </Text>
                              <Text style={styles.alreadyLinkedDesc}>
                                Este cliente ya forma parte de tu libreta de
                                fiados activa.
                              </Text>
                            </View>
                          </View>
                          <View style={styles.alreadyLinkedDivider} />
                          <View style={styles.alreadyLinkedInfo}>
                            <Text style={styles.alreadyLinkedName}>
                              {foundCustomer.alias || foundCustomer.name}
                            </Text>
                            {foundCustomer.alias ? (
                              <Text style={styles.alreadyLinkedSub}>
                                Nombre: {foundCustomer.name}
                              </Text>
                            ) : null}
                            <Text style={styles.alreadyLinkedSub}>
                              {foundCustomer.document_type || 'CC'}{' '}
                              {foundCustomer.document_number} ·{' '}
                              {foundCustomer.phone || 'Sin teléfono'}
                            </Text>
                            <View style={styles.alreadyLinkedBalanceRow}>
                              <Text style={styles.alreadyLinkedBalanceLabel}>
                                Saldo pendiente:
                              </Text>
                              <Text
                                style={[
                                  styles.alreadyLinkedBalanceValue,
                                  Number(foundCustomer.current_balance) > 0
                                    ? styles.alreadyLinkedBalanceOwing
                                    : styles.alreadyLinkedBalanceClear,
                                ]}>
                                {formatCOP(
                                  Number(foundCustomer.current_balance || 0),
                                )}
                              </Text>
                            </View>
                            {Number(foundCustomer.credit_limit || 0) > 0 ? (
                              <Text style={styles.alreadyLinkedSub}>
                                Tope de crédito:{' '}
                                {formatCOP(Number(foundCustomer.credit_limit))}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ) : (
                        <>
                          <Card style={{gap: 4}}>
                            <Text style={styles.name}>
                              {foundCustomer.name}
                            </Text>
                            <Text style={styles.sub}>
                              {foundCustomer.phone ?? 'Sin teléfono'}
                            </Text>
                            {foundCustomer.email ? (
                              <Text style={styles.sub}>
                                {foundCustomer.email}
                              </Text>
                            ) : null}
                            <Text style={styles.sub}>
                              Cliente registrado en Tenderito
                            </Text>
                            {(profile?.subscription_plan ?? 'free') !==
                            'free' ? (
                              <Button
                                title="Ver historial"
                                variant="ghost"
                                onPress={() => {
                                  setModal(false);
                                  navigation.navigate('CustomerHistory', {
                                    id: foundCustomer.id,
                                  });
                                }}
                              />
                            ) : (
                              <Text style={styles.sub}>
                                El historial entre tiendas está disponible en
                                planes pagos.
                              </Text>
                            )}
                          </Card>
                          <Input
                            label="Tope de crédito"
                            value={
                              creditLimit ? FormatMoney(creditLimit) : '$ 0'
                            }
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
                  {paddingBottom: insets.bottom + 12},
                ]}>
                {verified ? (
                  isAlreadyLinked ? (
                    <View style={styles.alreadyLinkedFooter}>
                      <View style={styles.alreadyLinkedPill}>
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color="#15803D"
                        />
                        <Text style={styles.alreadyLinkedPillText}>
                          Cliente ya vinculado
                        </Text>
                      </View>
                      <Button
                        title="Ver detalles del cliente"
                        onPress={() => {
                          setModal(false);
                          resetForm();
                          navigation.navigate('CustomerDetail', {
                            id: foundCustomer?.id,
                          });
                        }}
                      />
                    </View>
                  ) : (
                    <Button
                      title={
                        foundCustomer
                          ? 'Vincular cliente a mi tienda'
                          : 'Guardar y vincular'
                      }
                      onPress={onCreate}
                    />
                  )
                ) : null}
                <Button
                  title={isAlreadyLinked ? 'Cerrar' : 'Volver atrás'}
                  variant="ghost"
                  onPress={() => {
                    setModal(false);
                    resetForm();
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
              <Card style={{gap: 4, minWidth: 280}}>
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
      <Modal
        visible={showUpgrade}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgrade(false)}>
        <View style={styles.overlay}>
          <Card style={styles.upgradeCard}>
            <View style={styles.upgradeIconWrap}>
              <Ionicons name="sparkles" size={26} color={Colors.primary} />
            </View>
            <Text style={styles.upgradeTitle}>Límite del plan Free</Text>
            <Text style={styles.upgradeText}>
              No puedes agregar más clientes porque estás en el plan Free (máximo 10 clientes).
              {'\n\n'}
              Tus clientes actuales se mantienen intactos y seguros. Para continuar registrando clientes, suscríbete a uno de nuestros planes.
            </Text>
            <Button
              title="Ver planes"
              onPress={() => {
                setShowUpgrade(false);
                navigation.navigate('Perfil');
              }}
              style={styles.upgradeBtn}
            />
            <Button
              title="Cerrar"
              variant="ghost"
              onPress={() => setShowUpgrade(false)}
            />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {backgroundColor: Colors.primaryLight, borderColor: Colors.primaryMid},
  filterText: {fontSize: 12, color: Colors.textSecondary, fontWeight: '600'},
  filterTextActive: {color: Colors.primary, fontWeight: '800'},
  flexOne: {flex: 1},
  customerCardItem: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  customerCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPaid: {
    backgroundColor: '#DCFCE7',
  },
  avatarTextPaid: {
    color: '#15803D',
  },
  customerCardBalanceCol: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  balanceLabelOwing: {
    color: Colors.destructive,
  },
  balanceLabelPaid: {
    color: '#15803D',
  },
  balanceOwing: {
    color: Colors.destructive,
  },
  balancePaid: {
    color: '#15803D',
  },
  cardFooterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardFooterText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {color: Colors.primary, fontWeight: '800', fontSize: 18},
  name: {fontWeight: '700', color: Colors.text},
  sub: {color: Colors.textSecondary, fontSize: 12},
  balance: {fontWeight: '800', color: Colors.text},
  sheet: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  sheetContent: {
    padding: 20,
    gap: 12,
    flexGrow: 1,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
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
    paddingVertical: 8,
    paddingRight: 8,
    minWidth: 64,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalFooter: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  label: {fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6},
  hint: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerValue: {fontSize: 16, fontWeight: '700', color: Colors.text},
  pickerChevron: {fontSize: 16, color: Colors.textSecondary},
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  typeOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  typeOptionText: {fontSize: 15, color: Colors.text},
  typeOptionTextSelected: {fontWeight: '700', color: Colors.text},
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: Colors.primary,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{scale: 0.96}],
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Estilos para cliente ya vinculado
  alreadyLinkedCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    padding: 16,
    gap: 4,
  },
  alreadyLinkedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  alreadyLinkedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  alreadyLinkedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  alreadyLinkedDesc: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 17,
  },
  alreadyLinkedDivider: {
    height: 1,
    backgroundColor: '#DCFCE7',
    marginVertical: 10,
  },
  alreadyLinkedInfo: {
    gap: 3,
  },
  alreadyLinkedName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  alreadyLinkedSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  alreadyLinkedBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  alreadyLinkedBalanceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  alreadyLinkedBalanceValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  alreadyLinkedBalanceOwing: {
    color: Colors.destructive,
  },
  alreadyLinkedBalanceClear: {
    color: '#15803D',
  },
  alreadyLinkedFooter: {
    gap: 10,
    width: '100%',
  },
  alreadyLinkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  alreadyLinkedPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  upgradeCard: {
    padding: 24,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: 12,
  },
  upgradeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFEDD5',
  },
  upgradeTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  upgradeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeBtn: {
    width: '100%',
    marginTop: 6,
  },
});
