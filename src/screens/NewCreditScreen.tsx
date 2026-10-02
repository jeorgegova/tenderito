import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Input} from '../components/ui/Input';
import {createCredit} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors} from '../theme';

export function NewCreditScreen({route, navigation}: any) {
  const initialId = route.params?.customerId as string | undefined;
  const [customer_id, setCustomerId] = useState(initialId ?? '');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');

  const {data: customers} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Elige cliente');
    }
    if (!concept.trim() || !Number(amount)) {
      return Alert.alert('Faltan datos', 'Concepto y monto válidos');
    }
    await createCredit({
      customer_id,
      concept: concept.trim(),
      amount: Number(amount),
      due_date: dueDate.trim() || null,
    });
    navigation.goBack();
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Nuevo fiado</Text>
      <Input
        label="ID cliente (o elige abajo)"
        value={customer_id}
        onChangeText={setCustomerId}
        placeholder="uuid cliente"
      />
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {(customers ?? []).slice(0, 5).map(c => (
          <Text
            key={c.id}
            onPress={() => setCustomerId(c.id)}
            style={[styles.chip, customer_id === c.id && styles.chipActive]}>
            {c.name}
          </Text>
        ))}
      </View>
      <Input
        label="Concepto"
        value={concept}
        onChangeText={setConcept}
        placeholder="Ej. Mercado semanal"
      />
      <Input
        label="Monto (COP)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="50000"
      />
      <Input
        label="Vence (YYYY-MM-DD, opcional)"
        value={dueDate}
        onChangeText={setDueDate}
        placeholder="2026-10-15"
      />
      <Button title="Guardar fiado" onPress={onSave} />
      <Button
        title="Cancelar"
        variant="ghost"
        onPress={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.card,
    padding: 20,
    gap: 12,
    paddingTop: 32,
  },
  title: {fontSize: 22, fontWeight: '800', color: Colors.text, textAlign: 'center'},
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
