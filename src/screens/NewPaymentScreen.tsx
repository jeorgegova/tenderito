import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Input} from '../components/ui/Input';
import {fetchCustomers} from '../services/customers';
import {createPayment} from '../services/payments';
import {Colors, formatCOP} from '../theme';
import {FormatMoney, parseMoney} from '../utils/format';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMutationWithSync} from '../hooks/useMutationWithSync';

export function NewPaymentScreen({route, navigation}: any) {
  const initialId = route.params?.customerId as string | undefined;
  const [customer_id, setCustomerId] = useState(initialId ?? '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const insets = useSafeAreaInsets();

  const {data: customers} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const selectedCustomer = customers?.find(c => c.id === customer_id);
  const currentBalance = Number(selectedCustomer?.current_balance ?? 0);
  const numericAmount = parseMoney(amount);

  // Cálculos sencillos y directos
  const remainingBalance = Math.max(0, currentBalance - numericAmount);
  const exceedsBalance = currentBalance > 0 && numericAmount > currentBalance;
  const isTotalPayment = currentBalance > 0 && numericAmount === currentBalance;

  const matchingCustomers = (customers ?? []).filter(c =>
    `${c.alias ?? ''} ${c.name} ${c.document_number ?? ''}`
      .toLocaleLowerCase('es-CO')
      .includes(customerSearch.toLocaleLowerCase('es-CO')),
  );

  const mutation = useMutationWithSync(createPayment, {
    customerId: customer_id,
    onSuccess: () => navigation.goBack(),
    onError: (error: any) =>
      Alert.alert('No se pudo guardar', error?.message ?? 'Intenta de nuevo'),
  });

  // Tocar para pagar toda la deuda de una sola vez
  const handlePayAll = () => {
    if (currentBalance <= 0) return;
    if (isTotalPayment) {
      setAmount('');
    } else {
      setAmount(FormatMoney(String(currentBalance)));
    }
  };

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Selecciona un cliente');
    }
    if (!numericAmount || numericAmount <= 0) {
      return Alert.alert('Ingresa el valor', 'Escribe cuánto te entregó o abonó el cliente.');
    }
    if (exceedsBalance) {
      return Alert.alert(
        'Supera lo que debe',
        `El cliente solo debe ${formatCOP(currentBalance)}. No puedes ingresar un valor mayor.`,
      );
    }
    mutation.mutate({
      customer_id,
      credit_id: null,
      amount: numericAmount,
      notes: notes.trim() || null,
    });
  }

  return (
    <View style={styles.sheet}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {selectedCustomer ? (
          <View style={{gap: 16}}>
            {/* Tarjeta principal del cliente y su deuda */}
            <Card style={styles.mainCard}>
              <View style={styles.customerHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {(selectedCustomer.alias || selectedCustomer.name)
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.customerName}>
                    {selectedCustomer.alias || selectedCustomer.name}
                  </Text>
                  <Text style={styles.muted}>
                    {selectedCustomer.document_number
                      ? `C.C. ${selectedCustomer.document_number}`
                      : 'Cliente'}
                  </Text>
                </View>
                {!initialId ? (
                  <Pressable onPress={() => setCustomerId('')} hitSlop={12}>
                    <Text style={styles.change}>Cambiar</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Lo que debe en grande */}
              <View style={styles.balanceBox}>
                <Text style={styles.balanceTitle}>Debe en total</Text>
                <Text style={styles.balanceNumber}>{formatCOP(currentBalance)}</Text>
              </View>

              {/* Botón rápido y grande para pagar todo */}
              {currentBalance > 0 ? (
                <Pressable
                  onPress={handlePayAll}
                  style={[
                    styles.payAllButton,
                    isTotalPayment && styles.payAllButtonActive,
                  ]}
                >
                  <Ionicons
                    name={isTotalPayment ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isTotalPayment ? '#FFFFFF' : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.payAllText,
                      isTotalPayment && styles.payAllTextActive,
                    ]}
                  >
                    Pagar toda la deuda ({formatCOP(currentBalance)})
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.zeroBox}>
                  <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                  <Text style={styles.zeroText}>Este cliente está al día (debe $ 0)</Text>
                </View>
              )}
            </Card>

            {/* Entrada del abono */}
            <View style={styles.inputSection}>
              <Input
                label="¿Cuánto te entregó o abonó?"
                value={amount ? FormatMoney(amount) : ''}
                onChangeText={value => setAmount(FormatMoney(value))}
                keyboardType="numeric"
                placeholder="$ 0"
                error={
                  exceedsBalance
                    ? `Supera lo que debe. El cliente solo debe ${formatCOP(currentBalance)}`
                    : undefined
                }
              />

              {/* Mensajes de resultado sencillos */}
              {exceedsBalance ? (
                <View style={styles.alertBox}>
                  <Ionicons name="alert-circle-outline" size={18} color={Colors.destructive} />
                  <Text style={styles.alertText}>
                    Supera lo que debe. El cliente debe {formatCOP(currentBalance)}, no puedes registrar un abono de {formatCOP(numericAmount)}.
                  </Text>
                </View>
              ) : numericAmount > 0 ? (
                isTotalPayment ? (
                  <View style={styles.peaceBox}>
                    <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                    <Text style={styles.peaceText}>
                      ¡Queda a paz y salvo! La deuda quedará en $ 0.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.remainingBox}>
                    <Ionicons
                      name="information-circle-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.remainingText}>
                      Ahora quedará debiendo:{' '}
                      <Text style={styles.remainingBold}>{formatCOP(remainingBalance)}</Text>
                    </Text>
                  </View>
                )
              ) : null}

              <Input
                label="Nota (opcional)"
                value={notes}
                onChangeText={setNotes}
                placeholder="Ej. En efectivo, Nequi..."
              />
            </View>
          </View>
        ) : (
          /* Buscador de clientes si entra sin cliente seleccionado */
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>¿A qué cliente le vas a cobrar?</Text>
            <Input
              leadingIcon="search"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Escribe el nombre o alias..."
            />
            <ScrollView
              style={styles.options}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {matchingCustomers.map(customer => (
                <Pressable
                  key={customer.id}
                  onPress={() => {
                    setCustomerId(customer.id);
                    setCustomerSearch('');
                  }}
                  style={styles.option}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(customer.alias || customer.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.customerName}>{customer.alias || customer.name}</Text>
                    <Text style={styles.muted}>
                      Debe: {formatCOP(Number(customer.current_balance))}
                    </Text>
                  </View>
                </Pressable>
              ))}
              {matchingCustomers.length === 0 ? (
                <Text style={styles.mutedEmpty}>No encontramos clientes con ese nombre.</Text>
              ) : null}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Botón inferior claro y grande */}
      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, 12) + 8}]}>
        <Button
          title={mutation.isPending ? 'Guardando…' : 'Guardar abono'}
          icon="check"
          onPress={onSave}
          disabled={mutation.isPending || exceedsBalance || !numericAmount}
        />
        <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, paddingTop: 20, gap: 16},
  footer: {
    padding: 16,
    paddingBottom: 26,
    gap: 8,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  mainCard: {
    padding: 16,
    gap: 14,
    borderRadius: 18,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 18,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  muted: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  change: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  balanceBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  balanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.destructive,
    marginTop: 4,
  },
  payAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#FFF1E6',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
  },
  payAllButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  payAllText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  payAllTextActive: {
    color: '#FFFFFF',
  },
  zeroBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  zeroText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  inputSection: {
    gap: 12,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
    lineHeight: 18,
  },
  peaceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  peaceText: {
    flex: 1,
    fontSize: 13,
    color: '#15803D',
    fontWeight: '700',
  },
  remainingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.cardAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  remainingText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  remainingBold: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  picker: {gap: 10},
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  options: {
    maxHeight: 220,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  mutedEmpty: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
