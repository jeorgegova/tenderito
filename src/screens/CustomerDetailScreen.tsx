import {useQuery} from '@tanstack/react-query';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {Badge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {FooterMenu} from '../components/ui/FooterMenu';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
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
  const movements = [
    ...(credits.data ?? []).map(c => ({kind: 'credit' as const, date: c.created_at, ...c})),
    ...(payments.data ?? []).map(p => ({kind: 'payment' as const, date: p.payment_date, ...p})),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <View style={styles.wrap}>
      <View style={{padding: 20, gap: 12}}>
        <Card style={styles.hero}>
          <View style={styles.customerHeading}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(customer.data?.alias || customer.data?.name || '?').charAt(0).toUpperCase()}</Text></View>
            <View style={{flex: 1}}>
              <Text style={styles.name}>{customer.data?.alias || customer.data?.name || '…'}</Text>
              {customer.data?.alias ? <Text style={styles.phone}>{customer.data.name}</Text> : null}
            </View>
          </View>
          <Text style={styles.phone}>{customer.data?.phone ?? 'Sin teléfono'}</Text>
          <Text style={styles.phone}>
            {customer.data?.document_type} {customer.data?.document_number}
          </Text>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricLabel}>Saldo pendiente</Text><Text style={styles.balance}>{formatCOP(Number(customer.data?.current_balance ?? 0))}</Text></View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}><Text style={styles.metricLabel}>Tope de crédito</Text><Text style={styles.limit}>{formatCOP(Number(customer.data?.credit_limit ?? 0))}</Text></View>
          </View>
        </Card>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1}}>
            <Button
              title="Nuevo fiado"
              icon="credit"
              onPress={() => navigation.navigate('NewCredit', {customerId: id})}
            />
          </View>
          <View style={{flex: 1}}>
            <Button
              title="Abonar"
              icon="incoming"
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
        data={movements}
        keyExtractor={(i: any) => i.kind + i.id}
        ListHeaderComponent={<Text style={styles.section}>Actividad reciente</Text>}
        ListEmptyComponent={!credits.isLoading && !payments.isLoading ? <Card style={styles.empty}><MonochromeIcon name="receipt" color={Colors.textSecondary} size={20} /><Text style={styles.phone}>Aún no hay fiados ni abonos registrados.</Text></Card> : null}
        renderItem={({item}: any) =>
          item.kind === 'credit' ? (
            <Card style={styles.row}>
              <View style={{flex: 1}}>
                <Text style={styles.concept}>{item.concept}</Text>
                <Text style={styles.date}>
                  {new Date(item.date).toLocaleDateString('es-CO')}
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
                  {new Date(item.date).toLocaleDateString('es-CO')}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>
                -{formatCOP(Number(item.amount))}
              </Text>
            </Card>
          )
        }
      />
      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  hero: {backgroundColor: Colors.card},
  name: {fontSize: 22, fontWeight: '800', color: Colors.text},
  customerHeading: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8},
  avatar: {width: 48, height: 48, borderRadius: 18, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center'},
  avatarText: {fontSize: 20, fontWeight: '800', color: Colors.primary},
  phone: {color: Colors.textSecondary},
  metrics: {flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border},
  metric: {flex: 1, gap: 5},
  metricDivider: {width: 1, backgroundColor: Colors.border, marginHorizontal: 14},
  metricLabel: {fontSize: 11, color: Colors.textSecondary},
  limit: {fontSize: 15, color: Colors.text, fontWeight: '800'},
  balance: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '800',
    color: Colors.destructive,
  },
  section: {fontSize: 19, fontWeight: '800', color: Colors.text, marginVertical: 8},
  empty: {alignItems: 'center', gap: 8, paddingVertical: 24},
  row: {flexDirection: 'row', alignItems: 'center'},
  concept: {fontWeight: '600', color: Colors.text},
  date: {fontSize: 12, color: Colors.textSecondary},
  creditAmount: {fontWeight: '800', color: Colors.destructive},
  paymentAmount: {fontWeight: '800', color: '#15803D'},
});
