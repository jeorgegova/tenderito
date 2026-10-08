import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {OverdueBadge} from '../components/ui/Badge';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {Input} from '../components/ui/Input';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {fetchOverdueCredits} from '../services/credits';
import {Colors, formatCOP} from '../theme';

export function ReportsScreen({navigation}: any) {
  const [search, setSearch] = useState('');
  const {data, isLoading, refetch} = useQuery({
    queryKey: ['overdue'],
    queryFn: fetchOverdueCredits,
  });
  const total = (data ?? []).reduce((sum, credit) => sum + Number(credit.amount), 0);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CO');
    return (data ?? []).filter(item =>
      !query || `${item.customers?.name ?? ''} ${item.concept ?? ''}`.toLocaleLowerCase('es-CO').includes(query),
    );
  }, [data, search]);

  return (
    <View style={styles.wrap}>
      <Header title="Vencidos" subtitle="Fiados que necesitan seguimiento" />
      <View style={styles.summaryWrap}>
        <Card style={styles.summary}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryIcon}><MonochromeIcon name="clock" color={Colors.destructive} size={19} /></View>
            <Text style={styles.summaryLabel}>TOTAL VENCIDO</Text>
          </View>
          <Text style={styles.summaryValue}>{formatCOP(total)}</Text>
          <Text style={styles.summarySub}>{data?.length ?? 0} fiados vencidos por cobrar</Text>
        </Card>
      </View>
      <View style={styles.searchWrap}>
        <Input placeholder="Buscar cliente o fiado" value={search} onChangeText={setSearch} leadingIcon="search" returnKeyType="search" />
      </View>
      <FlatList
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={item => item.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListHeaderComponent={<Text style={styles.listTitle}>Pendientes de cobro</Text>}
        ListEmptyComponent={!isLoading ? (
          <Card style={styles.empty}>
            <View style={styles.emptyIcon}><MonochromeIcon name={search ? 'search' : 'check'} color={search ? Colors.textSecondary : Colors.success} size={21} /></View>
            <Text style={styles.emptyTitle}>{search ? 'Sin coincidencias' : 'Todo al día'}</Text>
            <Text style={styles.emptyText}>{search ? 'Prueba con otro nombre o concepto.' : 'No tienes fiados vencidos por cobrar.'}</Text>
          </Card>
        ) : null}
        renderItem={({item}) => (
          <Pressable onPress={() => navigation.navigate('CustomerDetail', {id: item.customer_id})}>
            <Card style={styles.row}>
              <View style={styles.alertIcon}><MonochromeIcon name="clock" color={Colors.destructive} size={18} /></View>
              <View style={{flex: 1}}>
                <Text style={styles.name}>{item.customers?.name ?? 'Cliente'}</Text>
                <Text style={styles.detail} numberOfLines={1}>{item.concept}</Text>
                <Text style={styles.date}>Venció el {new Date(`${item.due_date}T12:00:00`).toLocaleDateString('es-CO', {day: 'numeric', month: 'short', year: 'numeric'})}</Text>
              </View>
              <View style={styles.amountCol}>
                <Text style={styles.amount}>{formatCOP(Number(item.amount))}</Text>
                <OverdueBadge text="Vencido" />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  summaryWrap: {paddingHorizontal: 20},
  summary: {backgroundColor: '#FFF1F0', borderColor: '#FCE0DE', borderRadius: 22},
  summaryTop: {flexDirection: 'row', alignItems: 'center', gap: 9},
  summaryIcon: {height: 32, width: 32, borderRadius: 12, backgroundColor: '#FFE0DC', alignItems: 'center', justifyContent: 'center'},
  summaryLabel: {color: Colors.destructive, fontWeight: '800', fontSize: 10, letterSpacing: 1},
  summaryValue: {color: Colors.text, fontSize: 30, fontWeight: '800', marginTop: 8},
  summarySub: {color: Colors.textSecondary, fontSize: 12, marginTop: 1},
  searchWrap: {paddingHorizontal: 20, paddingTop: 14},
  list: {padding: 20, paddingTop: 14, gap: 10, paddingBottom: 28},
  listTitle: {fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 1},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13},
  alertIcon: {width: 36, height: 36, borderRadius: 13, backgroundColor: '#FEF0EE', alignItems: 'center', justifyContent: 'center'},
  name: {fontWeight: '700', color: Colors.text, fontSize: 14},
  detail: {color: Colors.textSecondary, fontSize: 12, marginTop: 2},
  date: {color: Colors.destructive, fontSize: 11, fontWeight: '700', marginTop: 4},
  amountCol: {alignItems: 'flex-end', gap: 6},
  amount: {fontWeight: '800', color: Colors.destructive, fontSize: 12},
  empty: {alignItems: 'center', gap: 5, paddingVertical: 24},
  emptyIcon: {width: 42, height: 42, borderRadius: 15, backgroundColor: '#EAF7EE', alignItems: 'center', justifyContent: 'center', marginBottom: 4},
  emptyTitle: {fontWeight: '800', color: Colors.text},
  emptyText: {color: Colors.textSecondary, fontSize: 12, textAlign: 'center'},
});
