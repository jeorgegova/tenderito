import {useQuery} from '@tanstack/react-query';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {OverdueBadge} from '../components/ui/Badge';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {fetchOverdueCredits} from '../services/credits';
import {Colors, formatCOP} from '../theme';

export function ReportsScreen() {
  const {data, isLoading, refetch} = useQuery({
    queryKey: ['overdue'],
    queryFn: fetchOverdueCredits,
  });
  const total = (data ?? []).reduce((a, c) => a + Number(c.amount), 0);

  return (
    <View style={styles.wrap}>
      <Header title="Alertas" subtitle="Vencimientos y reportes" />
      <View style={{paddingHorizontal: 20}}>
        <Card style={styles.summary}>
          <Text style={styles.summaryLabel}>En mora</Text>
          <Text style={styles.summaryValue}>{formatCOP(total)}</Text>
          <Text style={styles.summarySub}>
            {data?.length ?? 0} créditos vencidos
          </Text>
        </Card>
      </View>
      <FlatList
        contentContainerStyle={{padding: 20, gap: 12}}
        data={data ?? []}
        keyExtractor={i => i.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={{color: Colors.textSecondary}}>Sin vencidos.</Text>
            </Card>
          ) : null
        }
        renderItem={({item}) => (
          <Card style={styles.row}>
            <View style={{flex: 1}}>
              <Text style={styles.name}>
                {item.customers?.name ?? 'Cliente'}
              </Text>
              <Text style={styles.detail}>{item.concept}</Text>
              <Text style={styles.date}>Venció: {item.due_date}</Text>
            </View>
            <View style={{alignItems: 'flex-end', gap: 6}}>
              <Text style={styles.amount}>
                {formatCOP(Number(item.amount))}
              </Text>
              <OverdueBadge text="Vencido" />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  summary: {
    backgroundColor: Colors.destructive,
    borderColor: Colors.destructive,
  },
  summaryLabel: {color: '#FECACA', fontWeight: '600'},
  summaryValue: {color: '#fff', fontSize: 32, fontWeight: '800'},
  summarySub: {color: '#FECACA'},
  row: {
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: Colors.destructive,
  },
  name: {fontWeight: '700', color: Colors.text},
  detail: {color: Colors.textSecondary, fontSize: 13},
  date: {color: Colors.destructive, fontSize: 12, fontWeight: '600'},
  amount: {fontWeight: '800', color: Colors.destructive},
});
