import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Header } from '../components/ui/Header';
import { Input } from '../components/ui/Input';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  canCreateCustomer,
  createCustomer,
  findCustomerByDocument,
  fetchCustomers,
  linkCustomerToStore,
} from '../services/customers';
import { useStore } from '../store/useStore';
import { Colors, formatCOP } from '../theme';
import { FormatMoney, parseMoney } from '../utils/format';

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'CC · Cédula de ciudadanía' },
  { value: 'CE', label: 'CE · Cédula de extranjería' },
  { value: 'NIT', label: 'NIT · Número tributario' },
  { value: 'PAS', label: 'PAS · Pasaporte' },
  { value: 'PEP', label: 'PEP · Permiso especial' },
  { value: 'PPT', label: 'PPT · Permiso protección temporal' },
];

export function CustomersScreen({ navigation }: any) {
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owing' | 'clear'>('all');
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

  async function onCheckDocument() {
    if (!documentNumber.trim()) {
      return Alert.alert('Faltan datos', 'Ingresa la cédula del cliente');
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
        Alert.alert(
          'Cliente encontrado',
          'Revisa sus datos y define el tope de crédito.',
        );
      } else {
        setName('');
        Alert.alert('Cliente nuevo', 'Completa los datos para registrarlo.');
      }
    } catch (error: any) {
      Alert.alert('No se pudo verificar', error?.message ?? 'Intenta de nuevo');
    } finally {
      setCheckingDocument(false);
    }
  }

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(),
  });
  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CO');
    return (data ?? []).filter(customer => {
      const matchesSearch = !query ||
        customer.name.toLocaleLowerCase('es-CO').includes(query) ||
        (customer.alias ?? '').toLocaleLowerCase('es-CO').includes(query) ||
        (customer.document_number ?? '').includes(query) ||
        (customer.phone ?? '').includes(query);
      const hasBalance = Number(customer.current_balance) > 0;
      return matchesSearch && (balanceFilter === 'all' || (balanceFilter === 'owing' ? hasBalance : !hasBalance));
    });
  }, [data, search, balanceFilter]);

  async function onCreate() {
    if (foundCustomer) {
      if (!documentNumber.trim()) {
        return Alert.alert(
          'Faltan datos',
          'Identificación es obligatoria',
        );
      }
    } else if (!name.trim() || !documentNumber.trim() || !phone.trim()) {
      return Alert.alert(
        'Faltan datos',
        'Nombre, identificación y teléfono son obligatorios',
      );
    }
    try {
      if (!foundCustomer) {
        const plan = profile?.subscription_plan ?? 'free';
        const check = await canCreateCustomer(plan);
        if (!check.allowed) {
          setModal(false);
          setShowUpgrade(true);
          return;
        }
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
      Alert.alert('No se pudo guardar', error?.message ?? 'Intenta de nuevo');
      console.log("Error al guardar cliente", error)
    }
  }

  return (
    <View style={styles.wrap}>
      <Header title="Clientes" subtitle="Busca y gestiona tus fiados" />
      <View style={{ paddingHorizontal: 20 }}>
        <Input
          placeholder="Nombre, alias, cédula o teléfono"
          value={search}
          onChangeText={setSearch}
          leadingIcon="search"
          returnKeyType="search"
        />
      </View>
      <View style={styles.filterRow}>
        {([
          {key: 'all', label: `Todos · ${data?.length ?? 0}`},
          {key: 'owing', label: `Con saldo · ${(data ?? []).filter(c => Number(c.current_balance) > 0).length}`},
          {key: 'clear', label: 'Al día'},
        ] as const).map(filter => (
          <Pressable
            key={filter.key}
            onPress={() => setBalanceFilter(filter.key)}
            style={[styles.filterChip, balanceFilter === filter.key && styles.filterChipActive]}>
            <Text style={[styles.filterText, balanceFilter === filter.key && styles.filterTextActive]}>{filter.label}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 96 }}
        data={visibleCustomers}
        keyExtractor={i => i.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={{ color: Colors.textSecondary }}>
                {search || balanceFilter !== 'all' ? 'No hay clientes que coincidan con estos filtros.' : 'Sin clientes. Crea el primero.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              navigation.navigate('CustomerDetail', { id: item.id })
            }>
            <Card style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.alias || item.name).charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>{item.alias || item.name}</Text>
                {item.alias ? <Text style={styles.sub} numberOfLines={1}>{item.name}</Text> : null}
                <Text style={styles.sub}>{item.phone ?? 'Sin teléfono'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text
                  style={[
                    styles.balance,
                    Number(item.current_balance) > 0 && {
                      color: Colors.destructive,
                    },
                  ]}>
                  {formatCOP(Number(item.current_balance))}
                </Text>
                <Badge
                  status={Number(item.current_balance) > 0 ? 'pending' : 'paid'}
                />
              </View>
            </Card>
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => {
          resetForm();
          setModal(true);
        }}
        style={({pressed}) => [styles.fab, pressed && {opacity: 0.85}]}>
        <Text style={styles.fabPlus}>+</Text>
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
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
            <View style={{flex: 1}}>
              <ScrollView
                style={{flex: 1}}
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ width: 110 }}>
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
                      transform: [{ translateY: slideAnim }],
                      gap: 12,
                    }}>
                    {foundCustomer ? (
                      <>
                        <Card style={{ gap: 4 }}>
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
                  <Button
                    title={
                      foundCustomer
                        ? 'Vincular cliente a mi tienda'
                        : 'Guardar y vincular'
                    }
                    onPress={onCreate}
                  />
                ) : null}
                <Button
                  title="Volver atrás"
                  variant="ghost"
                  onPress={() => setModal(false)}
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
                      item.value === documentType &&
                      styles.typeOptionSelected,
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
          <Card style={{ gap: 8 }}>
            <Text style={styles.sheetTitle}>Límite del plan Free</Text>
            <Text style={{ color: Colors.textSecondary }}>
              Llegaste a 10 clientes. Sube a Basic (100 clientes) o Pro
              (ilimitado) para seguir creciendo.
            </Text>
            <Button
              title="Ver planes"
              onPress={() => {
                setShowUpgrade(false);
                navigation.navigate('Perfil');
              }}
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
  wrap: { flex: 1, backgroundColor: Colors.background },
  filterRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 12},
  filterChip: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border},
  filterChipActive: {backgroundColor: '#FFF1E6', borderColor: '#FFD5B3'},
  filterText: {fontSize: 12, color: Colors.textSecondary, fontWeight: '600'},
  filterTextActive: {color: Colors.primary, fontWeight: '800'},
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEAD6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.primary, fontWeight: '800', fontSize: 18 },
  name: { fontWeight: '700', color: Colors.text },
  sub: { color: Colors.textSecondary, fontSize: 12 },
  balance: { fontWeight: '800', color: Colors.text },
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
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
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
  pickerValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pickerChevron: { fontSize: 16, color: Colors.textSecondary },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  typeOptionSelected: {
    backgroundColor: '#FFEAD6',
  },
  typeOptionText: { fontSize: 15, color: Colors.text },
  typeOptionTextSelected: { fontWeight: '700', color: Colors.text },
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
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPlus: {color: '#fff', fontSize: 20, fontWeight: '800'},
  fabText: {color: '#fff', fontSize: 16, fontWeight: '700'},
});
