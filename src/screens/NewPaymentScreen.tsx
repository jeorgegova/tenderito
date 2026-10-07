import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Input} from '../components/ui/Input';
import {fetchCreditsByCustomer} from '../services/credits';
import {createPayment} from '../services/payments';
import {Colors} from '../theme';

export function NewPaymentScreen({route, navigation}: any) {
  const customerId = route.params?.customerId as string | undefined;
  const [customer_id] = useState(customerId ?? '');
  const [credit_id, setCreditId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const {data: credits} = useQuery({
    queryKey: ['credits', customer_id],
    queryFn: () => fetchCreditsByCustomer(customer_id),
    enabled: !!customer_id,
  });

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Falta cliente');
    }
    if (!Number(amount)) {
      return Alert.alert('Monto inválido');
    }
    try {
      await createPayment({
        customer_id,
        credit_id,
        amount: Number(amount),
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('No se pudo registrar', error?.message ?? 'Intenta de nuevo');
    }
  }

  return (
    <View style={styles.sheet}>
      <Text style={styles.title}>Registrar abono</Text>
      <Text style={styles.hint}>
        Toca un fiado para asociar el pago, o deja "Deuda global".
      </Text>
      <Text
        onPress={() => setCreditId(null)}
        style={[styles.chip, credit_id === null && styles.chipActive]}>
        Deuda global
      </Text>
      {(credits ?? [])
        .filter(c => c.status !== 'paid')
        .map(c => (
          <Text
            key={c.id}
            onPress={() => setCreditId(c.id)}
            style={[styles.chip, credit_id === c.id && styles.chipActive]}>
            {c.concept} — {c.amount}
          </Text>
        ))}
      <Input
        label="Monto abono (COP)"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="20000"
      />
      <Input
        label="Nota (opcional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Abono parcial"
      />
      <Button title="Guardar abono" onPress={onSave} />
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
  hint: {color: Colors.textSecondary, fontSize: 13},
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.cardAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
  },
  chipActive: {backgroundColor: Colors.primary, color: '#fff'},
});
