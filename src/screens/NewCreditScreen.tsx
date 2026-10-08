import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Input} from '../components/ui/Input';
import {createCredit} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors, formatCOP} from '../theme';
import {FormatMoney, parseMoney} from '../utils/format';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

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
  const matchingCustomers = (customers ?? []).filter(c =>
    `${c.alias ?? ''} ${c.name} ${c.document_number ?? ''}`
      .toLocaleLowerCase('es-CO')
      .includes(customerSearch.toLocaleLowerCase('es-CO')),
  );

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Elige cliente');
    }
    if (!concept.trim() || !parseMoney(amount)) {
      return Alert.alert('Faltan datos', 'Concepto y monto válidos');
    }
    try {
      await createCredit({
        customer_id,
        concept: concept.trim(),
        amount: parseMoney(amount),
        due_date: dueDate.trim() || null,
      });
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('No se pudo registrar', error?.message ?? 'Intenta de nuevo');
    }
  }

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Registra una compra que el cliente pagará después.</Text>
        {selectedCustomer ? (
          <Card style={styles.selected}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(selectedCustomer.alias || selectedCustomer.name).charAt(0).toUpperCase()}</Text></View>
            <View style={{flex: 1}}><Text style={styles.customerName}>{selectedCustomer.alias || selectedCustomer.name}</Text><Text style={styles.muted}>Debe {formatCOP(Number(selectedCustomer.current_balance))}</Text></View>
            {!initialId ? <Text onPress={() => setCustomerId('')} style={styles.change}>Cambiar</Text> : null}
          </Card>
        ) : (
          <View style={styles.picker}>
            <Input label="Buscar cliente" leadingIcon="search" value={customerSearch} onChangeText={setCustomerSearch} placeholder="Nombre, alias o cédula" />
            <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {matchingCustomers.map(customer => (
                <Pressable key={customer.id} onPress={() => {setCustomerId(customer.id); setCustomerSearch('');}} style={styles.option}>
                  <View style={styles.optionAvatar}><Text style={styles.avatarText}>{(customer.alias || customer.name).charAt(0).toUpperCase()}</Text></View>
                  <View style={{flex: 1}}><Text style={styles.customerName}>{customer.alias || customer.name}</Text><Text style={styles.muted}>{formatCOP(Number(customer.current_balance))} pendiente</Text></View>
                </Pressable>
              ))}
              {matchingCustomers.length === 0 ? <Text style={styles.muted}>No encontramos clientes.</Text> : null}
            </ScrollView>
          </View>
        )}
        <Input label="¿Qué se llevó?" value={concept} onChangeText={setConcept} placeholder="Ej. Mercado de la semana" />
        <Input label="Valor del fiado" value={amount ? FormatMoney(amount) : ''} onChangeText={value => setAmount(FormatMoney(value))} keyboardType="numeric" placeholder="$ 0" />
        <Input label="Fecha para pagar (opcional)" value={dueDate} onChangeText={setDueDate} placeholder="AAAA-MM-DD" />
      </ScrollView>
      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, 12) + 8}]}>
        <Button title="Guardar fiado" icon="check" onPress={onSave} />
        <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, paddingTop: 28, gap: 14},
  footer: {padding: 16, paddingBottom: 26, gap: 8, backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border},
  subtitle: {fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: -8},
  selected: {flexDirection: 'row', alignItems: 'center', gap: 11},
  avatar: {width: 40, height: 40, borderRadius: 15, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center'},
  optionAvatar: {width: 36, height: 36, borderRadius: 13, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: Colors.primary, fontWeight: '800'},
  customerName: {fontSize: 14, fontWeight: '700', color: Colors.text},
  muted: {fontSize: 12, color: Colors.textSecondary},
  change: {color: Colors.primary, fontSize: 13, fontWeight: '700'},
  picker: {gap: 8},
  options: {maxHeight: 190, backgroundColor: Colors.card, borderRadius: 16, paddingHorizontal: 12},
  option: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border},
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
});
