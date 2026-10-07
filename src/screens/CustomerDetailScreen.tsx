import {useQuery} from '@tanstack/react-query';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {Badge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {fetchCreditsByCustomer} from '../services/credits';
import {fetchCustomerById} from '../services/customers';
import {fetchPaymentsByCustomer} from '../services/payments';
import {Colors, formatCOP} from '../theme';

export function CustomerDetailScreen({route, navigation}: any) {
  const {id} = route.params as {id: string};
  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomerById(id),
    enabled: !!id,
  });
  const credits = useQuery({
    queryKey: ['credits', id],
    queryFn: () => fetchCreditsByCustomer(id),
    enabled: !!id,
  });
  const payments = useQuery({
    queryKey: ['payments', id],
    queryFn: () => fetchPaymentsByCustomer(id),
    enabled: !!id,
  });

  return (
    <View style={styles.wrap}>
      <View style={{padding: 20, gap: 12}}>
        <Card style={styles.hero}>
          <Text style={styles.name}>{customer.data?.name ?? '…'}</Text>
          <Text style={styles.phone}>{customer.data?.phone ?? ''}</Text>
          <Text style={styles.phone}>
            {customer.data?.document_type} {customer.data?.document_number}
          </Text>
          <Text style={styles.balance}>
            Saldo: {formatCOP(Number(customer.data?.current_balance ?? 0))}
          </Text>
        </Card>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1}}>
            <Button
              title="+ Fiado"
              onPress={() => navigation.navigate('NewCredit', {customerId: id})}
            />
          </View>
          <View style={{flex: 1}}>
            <Button
              title="Abonar"
              variant="secondary"
              onPress={() =>
                navigation.navigate('NewPayment', {customerId: id})
              }
            />
          </View>
        </View>
      </View>
      <FlatList
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 40,
          gap: 8,
        }}
        data={[
          ...(credits.data ?? []).map(c => ({kind: 'credit' as const, ...c})),
          ...(payments.data ?? []).map(p => ({kind: 'payment' as const, ...p})),
        ]}
        keyExtractor={(i: any) => i.kind + i.id}
        ListHeaderComponent={<Text style={styles.section}>Historial</Text>}
        renderItem={({item}: any) =>
          item.kind === 'credit' ? (
            <Card style={styles.row}>
              <View style={{flex: 1}}>
                <Text style={styles.concept}>{item.concept}</Text>
                <Text style={styles.date}>
                  {new Date(item.created_at).toLocaleDateString('es-CO')}
                  {item.due_date ? ` · vence ${item.due_date}` : ''}
                </Text>
              </View>
              <View style={{alignItems: 'flex-end', gap: 4}}>
                <Text style={styles.creditAmount}>
                  +{formatCOP(Number(item.amount))}
                </Text>
                <Badge status={item.status} />
              </View>
            </Card>
          ) : (
            <Card style={styles.row}>
              <View style={{flex: 1}}>
                <Text style={styles.concept}>
                  Abono {item.notes ? `· ${item.notes}` : ''}
                </Text>
                <Text style={styles.date}>
                  {new Date(item.payment_date).toLocaleDateString('es-CO')}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>
                -{formatCOP(Number(item.amount))}
              </Text>
            </Card>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  hero: {backgroundColor: Colors.card},
  name: {fontSize: 22, fontWeight: '800', color: Colors.text},
  phone: {color: Colors.textSecondary},
  balance: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: Colors.destructive,
  },
  section: {fontSize: 18, fontWeight: '700', color: Colors.text, marginVertical: 8},
  row: {flexDirection: 'row', alignItems: 'center'},
  concept: {fontWeight: '600', color: Colors.text},
  date: {fontSize: 12, color: Colors.textSecondary},
  creditAmount: {fontWeight: '800', color: Colors.destructive},
  paymentAmount: {fontWeight: '800', color: '#15803D'},
});
