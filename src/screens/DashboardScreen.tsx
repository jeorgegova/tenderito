import {useQuery} from '@tanstack/react-query';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {Badge} from '../components/ui/Badge';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {
  fetchOverdueCredits,
  fetchTotalReceivable,
} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {Colors, formatCOP} from '../theme';

export function DashboardScreen({navigation}: any) {
  const total = useQuery({
    queryKey: ['total-receivable'],
    queryFn: fetchTotalReceivable,
  });
  const overdue = useQuery({
    queryKey: ['overdue'],
    queryFn: fetchOverdueCredits,
  });
  const topDebtors = useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(),
  });

  return (
    <View style={styles.wrap}>
      <Header title="Alfiao" subtitle="Resumen de cuentas por cobrar" />
      <FlatList
        contentContainerStyle={{padding: 20, gap: 16, paddingBottom: 100}}
        data={topDebtors.data?.slice(0, 5) ?? []}
        keyExtractor={i => i.id}
        ListHeaderComponent={
          <View style={{gap: 16}}>
            <Card style={styles.hero}>
              <Text style={styles.heroLabel}>Total por cobrar</Text>
              <Text style={styles.heroValue}>
                {total.isLoading ? '…' : formatCOP(Number(total.data ?? 0))}
              </Text>
              <Text style={styles.heroSub}>
                {topDebtors.data?.length ?? 0} clientes con saldo
              </Text>
            </Card>
            <Text style={styles.section}>Alertas de cobro</Text>
            {(overdue.data ?? []).length === 0 ? (
              <Card>
                <Text style={{color: Colors.textSecondary}}>
                  Sin créditos vencidos. Todo al día.
                </Text>
              </Card>
            ) : (
              (overdue.data ?? []).slice(0, 3).map(c => (
                <Card key={c.id} style={styles.alertCard}>
                  <View style={{flex: 1}}>
                    <Text style={styles.alertName}>
                      {c.customers?.name ?? 'Cliente'}
                    </Text>
                    <Text style={styles.alertDetail}>
                      {c.concept} · vence {c.due_date}
                    </Text>
                  </View>
                  <Text style={styles.alertAmount}>
                    {formatCOP(Number(c.amount))}
                  </Text>
                </Card>
              ))
            )}
            <Text style={styles.section}>Mayores deudores</Text>
          </View>
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() =>
              navigation.navigate('CustomerDetail', {id: item.id})
            }>
            <Card style={styles.row}>
              <View style={{flex: 1}}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone ?? 'Sin teléfono'}</Text>
              </View>
              <View style={{alignItems: 'flex-end', gap: 4}}>
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
                  status={
                    Number(item.current_balance) > 0 ? 'pending' : 'paid'
                  }
                />
              </View>
            </Card>
          </Pressable>
        )}
      />
      <Pressable
        style={styles.fab}
        onPress={() => navigation.navigate('NewCredit')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  hero: {backgroundColor: Colors.primary, borderColor: Colors.primary},
  heroLabel: {color: '#FFEAD6', fontSize: 14, fontWeight: '600'},
  heroValue: {color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4},
  heroSub: {color: '#FFEAD6', marginTop: 4},
  section: {fontSize: 18, fontWeight: '700', color: Colors.text, marginTop: 8},
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: Colors.destructive,
  },
  alertName: {fontWeight: '700', color: Colors.text},
  alertDetail: {color: Colors.textSecondary, fontSize: 12},
  alertAmount: {fontWeight: '800', color: Colors.destructive},
  row: {flexDirection: 'row', alignItems: 'center'},
  name: {fontWeight: '700', color: Colors.text, fontSize: 16},
  phone: {color: Colors.textSecondary, fontSize: 12},
  balance: {fontWeight: '800', color: Colors.text},
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  fabText: {color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -4},
});
