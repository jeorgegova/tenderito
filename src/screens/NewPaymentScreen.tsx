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

  // Cálculos de saldo resultante y validaciones
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
      Alert.alert('No se pudo registrar', error?.message ?? 'Intenta de nuevo'),
  });

  const handleToggleTotalPayment = () => {
    if (currentBalance <= 0) return;
    if (isTotalPayment) {
      setAmount('');
    } else {
      setAmount(FormatMoney(String(currentBalance)));
    }
  };

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Falta cliente', 'Por favor selecciona un cliente.');
    }
    if (!numericAmount || numericAmount <= 0) {
      return Alert.alert('Monto inválido', 'Ingresa un valor recibido válido.');
    }
    if (exceedsBalance) {
      return Alert.alert(
        'Supera el saldo pendiente',
        `El valor recibido (${formatCOP(numericAmount)}) supera la deuda total del cliente (${formatCOP(currentBalance)}). Por favor ajusta el valor.`,
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
        <Text style={styles.subtitle}>
          Registra un abono para reducir o cancelar la deuda del cliente.
        </Text>

        {selectedCustomer ? (
          <View style={{gap: 12}}>
            {/* Tarjeta destacada de saldo y selector de pago total */}
            <Card style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <View style={{flex: 1}}>
                  <Text style={styles.balanceLabel}>Saldo pendiente total</Text>
                  <Text style={styles.balanceValue}>{formatCOP(currentBalance)}</Text>
                </View>
                {currentBalance > 0 ? (
                  <Pressable
                    onPress={handleToggleTotalPayment}
                    style={[
                      styles.totalButton,
                      isTotalPayment && styles.totalButtonActive,
                    ]}
                  >
                    <Ionicons
                      name={isTotalPayment ? 'checkmark-circle' : 'cash-outline'}
                      size={18}
                      color={isTotalPayment ? '#FFFFFF' : Colors.primary}
                    />
                    <Text
                      style={[
                        styles.totalButtonText,
                        isTotalPayment && styles.totalButtonTextActive,
                      ]}
                    >
                      {isTotalPayment ? 'Total aplicado' : 'Pago total'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.zeroDebtBadge}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
                    <Text style={styles.zeroDebtText}>Al día</Text>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              {/* Datos del cliente */}
              <View style={styles.customerRow}>
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
                  {selectedCustomer.document_number ? (
                    <Text style={styles.muted}>C.C. {selectedCustomer.document_number}</Text>
                  ) : null}
                </View>
                {!initialId ? (
                  <Text onPress={() => setCustomerId('')} style={styles.change}>
                    Cambiar
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        ) : (
          <View style={styles.picker}>
            <Input
              label="Buscar cliente"
              leadingIcon="search"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Nombre, alias o cédula"
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
                  <View style={styles.optionAvatar}>
                    <Text style={styles.avatarText}>
                      {(customer.alias || customer.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.customerName}>{customer.alias || customer.name}</Text>
                    <Text style={styles.muted}>
                      {formatCOP(Number(customer.current_balance))} pendiente
                    </Text>
                  </View>
                </Pressable>
              ))}
              {matchingCustomers.length === 0 ? (
                <Text style={styles.muted}>No encontramos clientes.</Text>
              ) : null}
            </ScrollView>
          </View>
        )}

        {/* Input de Valor recibido con validación en tiempo real */}
        <View style={{gap: 6}}>
          <Input
            label="Valor recibido"
            value={amount ? FormatMoney(amount) : ''}
            onChangeText={value => setAmount(FormatMoney(value))}
            keyboardType="numeric"
            placeholder="$ 0"
            error={
              exceedsBalance
                ? `Supera el saldo pendiente. La deuda total es ${formatCOP(currentBalance)}`
                : undefined
            }
          />

          {exceedsBalance ? (
            <View style={styles.limitAlertBox}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.destructive} />
              <View style={{flex: 1}}>
                <Text style={styles.limitAlertTitle}>Supera el saldo pendiente</Text>
                <Text style={styles.limitAlertDesc}>
                  El abono ingresado supera la deuda total ({formatCOP(currentBalance)}). El excedente sería de {formatCOP(numericAmount - currentBalance)}.
                </Text>
              </View>
            </View>
          ) : numericAmount > 0 ? (
            isTotalPayment ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#15803D" />
                <Text style={styles.successText}>
                  Con este abono la deuda quedará completamente saldada en $ 0.
                </Text>
              </View>
            ) : (
              <Text style={styles.limitOkText}>
                El nuevo saldo pendiente quedaría en {formatCOP(remainingBalance)}
              </Text>
            )
          ) : null}
        </View>

        <Input
          label="Nota (opcional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Ej. Abono en efectivo, transferencia..."
        />
      </ScrollView>

      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, 12) + 8}]}>
        <Button
          title={mutation.isPending ? 'Guardando…' : 'Guardar abono'}
          icon="check"
          onPress={onSave}
          disabled={mutation.isPending || exceedsBalance}
        />
        <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, paddingTop: 28, gap: 14},
  footer: {
    padding: 16,
    paddingBottom: 26,
    gap: 8,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -8,
  },
  balanceCard: {
    padding: 16,
    gap: 12,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.destructive,
    marginTop: 2,
  },
  totalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FFF1E6',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  totalButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  totalButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },
  totalButtonTextActive: {
    color: '#FFFFFF',
  },
  zeroDebtBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
  },
  zeroDebtText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 15,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  muted: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  change: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  picker: {gap: 8},
  options: {
    maxHeight: 190,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 2,
  },
  limitAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.destructive,
  },
  limitAlertDesc: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
  },
  limitOkText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  successText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
});
