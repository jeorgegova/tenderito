import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {DatePicker} from '../components/ui/DatePicker';
import {Input} from '../components/ui/Input';
import {createCredit} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors, formatCOP} from '../theme';
import {FormatMoney, parseMoney} from '../utils/format';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMutationWithSync} from '../hooks/useMutationWithSync';

export function NewCreditScreen({route, navigation}: any) {
  const initialId = route.params?.customerId as string | undefined;
  const [customer_id, setCustomerId] = useState(initialId ?? '');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const insets = useSafeAreaInsets();

  const {data: customers} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const selectedCustomer = customers?.find(c => c.id === customer_id);
  const numericAmount = parseMoney(amount);
  const currentBalance = Number(selectedCustomer?.current_balance ?? 0);
  const creditLimit = Number(selectedCustomer?.credit_limit ?? 0);
  const newBalance = currentBalance + numericAmount;
  const exceedsLimit =
    creditLimit > 0 && numericAmount > 0 && newBalance > creditLimit;

  const matchingCustomers = (customers ?? []).filter(c =>
    `${c.alias ?? ''} ${c.name} ${c.document_number ?? ''}`
      .toLocaleLowerCase('es-CO')
      .includes(customerSearch.toLocaleLowerCase('es-CO')),
  );

  const mutation = useMutationWithSync(createCredit, {
    onSuccess: () => navigation.goBack(),
    onError: (error: any) =>
      Alert.alert('No se pudo registrar', error?.message ?? 'Intenta de nuevo'),
  });

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Elige cliente');
    }
    if (!concept.trim() || !parseMoney(amount)) {
      return Alert.alert('Faltan datos', 'Concepto y monto válidos');
    }
    mutation.mutate({
      customer_id,
      concept: concept.trim(),
      amount: parseMoney(amount),
      due_date: dueDate.trim() || null,
    });
  }

  return (
    <View style={styles.sheet}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>
          Registra una compra que el cliente pagará después.
        </Text>
        {selectedCustomer ? (
          <Card style={styles.selected}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(selectedCustomer.alias || selectedCustomer.name)
                  .charAt(0)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.flex1}>
              <Text style={styles.customerName} numberOfLines={1}>
                {selectedCustomer.alias && selectedCustomer.alias.trim()
                  ? selectedCustomer.alias
                  : selectedCustomer.name}
              </Text>
              {selectedCustomer.alias && selectedCustomer.alias.trim() ? (
                <Text style={styles.customerRealName} numberOfLines={1}>
                  {selectedCustomer.name}
                </Text>
              ) : null}
              <Text style={styles.muted}>
                Debe {formatCOP(currentBalance)}
                {creditLimit > 0 ? ` · Tope: ${formatCOP(creditLimit)}` : ''}
              </Text>
            </View>
            {!initialId ? (
              <Text onPress={() => setCustomerId('')} style={styles.change}>
                Cambiar
              </Text>
            ) : null}
          </Card>
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
              keyboardShouldPersistTaps="handled">
              {matchingCustomers.map(customer => {
                const hasAlias = Boolean(
                  customer.alias && customer.alias.trim(),
                );
                return (
                  <Pressable
                    key={customer.id}
                    onPress={() => {
                      setCustomerId(customer.id);
                      setCustomerSearch('');
                    }}
                    style={styles.option}>
                    <View style={styles.optionAvatar}>
                      <Text style={styles.avatarText}>
                        {(customer.alias || customer.name)
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {hasAlias ? customer.alias : customer.name}
                      </Text>
                      {hasAlias ? (
                        <Text style={styles.customerRealName} numberOfLines={1}>
                          {customer.name}
                        </Text>
                      ) : null}
                      <Text style={styles.muted}>
                        {customer.phone ? `📞 ${customer.phone} · ` : ''}
                        {formatCOP(Number(customer.current_balance))} pendiente
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {matchingCustomers.length === 0 ? (
                <Text style={styles.emptyOptionsText}>
                  No encontramos clientes con esa búsqueda.
                </Text>
              ) : null}
            </ScrollView>
          </View>
        )}
        <Input
          label="¿Qué se llevó?"
          value={concept}
          onChangeText={setConcept}
          placeholder="Ej. Mercado de la semana"
        />
        <View style={{gap: 6}}>
          <Input
            label="Valor del fiado"
            value={amount ? FormatMoney(amount) : ''}
            onChangeText={value => setAmount(FormatMoney(value))}
            keyboardType="numeric"
            placeholder="$ 0"
            error={
              exceedsLimit
                ? `Supera el valor del tope. El nuevo saldo quedaría en ${formatCOP(
                    newBalance,
                  )}`
                : undefined
            }
          />
          {exceedsLimit ? (
            <View style={styles.limitAlertBox}>
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={Colors.destructive}
              />
              <View style={{flex: 1}}>
                <Text style={styles.limitAlertTitle}>
                  Supera valor del tope
                </Text>
                <Text style={styles.limitAlertDesc}>
                  El tope asignado es {formatCOP(creditLimit)} y el nuevo saldo
                  quedaría en {formatCOP(newBalance)}.
                </Text>
              </View>
            </View>
          ) : creditLimit > 0 && numericAmount > 0 ? (
            <Text style={styles.limitOkText}>
              El nuevo saldo quedaría en {formatCOP(newBalance)} (Tope:{' '}
              {formatCOP(creditLimit)})
            </Text>
          ) : null}
        </View>
        <DatePicker
          label="Fecha para pagar (opcional)"
          value={dueDate}
          onChange={date => setDueDate(date ?? '')}
          placeholder="Toca para elegir fecha límite"
          minDate={new Date().toISOString().slice(0, 10)}
          helperText="Define el día en que acuerdas con el cliente que cancelará la cuenta."
        />
      </ScrollView>
      <View
        style={[
          styles.footer,
          {paddingBottom: Math.max(insets.bottom, 12) + 8},
        ]}>
        <Button
          title={mutation.isPending ? 'Guardando…' : 'Guardar fiado'}
          icon="check"
          onPress={onSave}
          disabled={mutation.isPending}
        />
        <Button
          title="Cancelar"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
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
  selected: {flexDirection: 'row', alignItems: 'center', gap: 11},
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {flex: 1},
  avatarText: {color: Colors.primary, fontWeight: '800'},
  customerName: {fontSize: 14, fontWeight: '700', color: Colors.text},
  customerRealName: {fontSize: 12, color: Colors.textSecondary},
  muted: {fontSize: 12, color: Colors.textSecondary},
  change: {color: Colors.primary, fontSize: 13, fontWeight: '700'},
  picker: {gap: 8},
  options: {
    maxHeight: 240,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  emptyOptionsText: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingVertical: 14,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
  },
  chipActive: {backgroundColor: Colors.primary, color: '#fff'},
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
});
