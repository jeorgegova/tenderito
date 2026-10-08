import {useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Input} from '../components/ui/Input';
import {fetchCreditsByCustomer} from '../services/credits';
import {createPayment} from '../services/payments';
import {Colors, formatCOP} from '../theme';
import {FormatMoney, parseMoney} from '../utils/format';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

export function NewPaymentScreen({route, navigation}: any) {
  const customerId = route.params?.customerId as string | undefined;
  const [customer_id] = useState(customerId ?? '');
  const [credit_id, setCreditId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const insets = useSafeAreaInsets();

  const {data: credits} = useQuery({
    queryKey: ['credits', customer_id],
    queryFn: () => fetchCreditsByCustomer(customer_id),
    enabled: !!customer_id,
  });

  async function onSave() {
    if (!customer_id) {
      return Alert.alert('Falta cliente');
    }
    if (!parseMoney(amount)) {
      return Alert.alert('Monto inválido');
    }
    try {
      await createPayment({
        customer_id,
        credit_id,
        amount: parseMoney(amount),
        notes: notes.trim() || null,
      });
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('No se pudo registrar', error?.message ?? 'Intenta de nuevo');
    }
  }

  const openCredits = (credits ?? []).filter(c => c.status !== 'paid');

  return (
    <View style={styles.sheet}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>Elige la deuda que estás pagando.</Text>
        <Pressable onPress={() => setCreditId(null)}>
          <Card style={[styles.creditOption, credit_id === null && styles.selectedOption]}>
            <View style={[styles.optionIcon, credit_id === null && styles.optionIconSelected]}><Text style={[styles.optionMark, credit_id === null && styles.optionMarkSelected]}>$</Text></View>
            <View style={{flex: 1}}><Text style={styles.optionTitle}>Abono a la deuda general</Text><Text style={styles.hint}>Se descontará del saldo total del cliente.</Text></View>
            <View style={[styles.radio, credit_id === null && styles.radioSelected]} />
          </Card>
        </Pressable>
        {openCredits.map(credit => {
          const selected = credit_id === credit.id;
          return <Pressable key={credit.id} onPress={() => setCreditId(credit.id)}>
            <Card style={[styles.creditOption, selected && styles.selectedOption]}>
              <View style={[styles.optionIcon, selected && styles.optionIconSelected]}><Text style={[styles.optionMark, selected && styles.optionMarkSelected]}>↗</Text></View>
              <View style={{flex: 1}}><Text style={styles.optionTitle}>{credit.concept}</Text><Text style={styles.hint}>Fiado del {new Date(credit.created_at).toLocaleDateString('es-CO')}</Text></View>
              <View style={styles.optionRight}><Text style={styles.amount}>{formatCOP(Number(credit.amount))}</Text><View style={[styles.radio, selected && styles.radioSelected]} /></View>
            </Card>
          </Pressable>;
        })}
        {openCredits.length === 0 ? <Text style={styles.hint}>No hay fiados pendientes. Puedes registrar el abono a la deuda general.</Text> : null}
        <Input label="Valor recibido" value={amount ? FormatMoney(amount) : ''} onChangeText={value => setAmount(FormatMoney(value))} keyboardType="numeric" placeholder="$ 0" />
        <Input label="Nota (opcional)" value={notes} onChangeText={setNotes} placeholder="Ej. Abono en efectivo" />
      </ScrollView>
      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, 12) + 8}]}>
        <Button title="Guardar abono" icon="check" onPress={onSave} />
        <Button title="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, paddingTop: 28, gap: 12},
  footer: {padding: 16, paddingBottom: 26, gap: 8, backgroundColor: Colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border},
  hint: {color: Colors.textSecondary, fontSize: 12, lineHeight: 17},
  creditOption: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1},
  selectedOption: {borderColor: Colors.primary, backgroundColor: '#FFFAF6'},
  optionIcon: {width: 36, height: 36, borderRadius: 13, backgroundColor: Colors.cardAlt, alignItems: 'center', justifyContent: 'center'},
  optionIconSelected: {backgroundColor: '#FFF1E6'},
  optionMark: {fontSize: 16, fontWeight: '800', color: Colors.textSecondary},
  optionMarkSelected: {color: Colors.primary},
  optionTitle: {fontSize: 13, fontWeight: '700', color: Colors.text},
  optionRight: {alignItems: 'flex-end', gap: 7},
  amount: {fontSize: 12, fontWeight: '800', color: Colors.text},
  radio: {width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.border},
  radioSelected: {borderColor: Colors.primary, borderWidth: 5},
});
