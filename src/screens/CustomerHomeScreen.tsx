import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import {Alert, FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {fetchCustomerPortal} from '../services/customerPortal';
import {Colors, formatCOP} from '../theme';
import {supabase} from '../lib/supabase';

export function CustomerHomeScreen() {
  const [movementFilter, setMovementFilter] = useState<'all' | 'credit' | 'payment'>('all');
  const {data, isLoading} = useQuery({
    queryKey: ['customer-portal'],
    queryFn: fetchCustomerPortal,
  });
  const total = (data?.stores ?? []).reduce(
    (sum: number, item: any) => sum + Number(item.current_balance),
    0,
  );
  const movements = useMemo(() => [
    ...(data?.credits ?? []).map((item: any) => ({...item, kind: 'credit' as const, movementDate: item.created_at})),
    ...(data?.payments ?? []).map((item: any) => ({...item, kind: 'payment' as const, movementDate: item.payment_date})),
  ].sort((a, b) => new Date(b.movementDate).getTime() - new Date(a.movementDate).getTime())
    .filter(item => movementFilter === 'all' || item.kind === movementFilter), [data, movementFilter]);

  async function logout() {
    const {error} = await supabase.auth.signOut();
    if (error) Alert.alert('No se pudo cerrar sesión', error.message);
  }

  return (
    <View style={styles.wrap}>
      <Header title="Mis fiados" subtitle={data?.customer?.name ?? 'Cliente'} />
      <FlatList
        contentContainerStyle={styles.content}
        data={data?.stores ?? []}
        keyExtractor={(item: any) => item.store_id}
        refreshing={isLoading}
        ListHeaderComponent={
          <>
            <Card style={styles.total}>
              <Text style={styles.label}>Total que debes</Text>
              <Text style={styles.totalAmount}>{formatCOP(total)}</Text>
            </Card>
            <Text style={styles.section}>Mis tiendas</Text>
          </>
        }
        ListEmptyComponent={
          <Card>
            <Text style={styles.muted}>Aún no tienes tiendas vinculadas.</Text>
          </Card>
        }
        renderItem={({item}: any) => (
          <Card style={styles.store}>
            <View style={{flex: 1}}>
              <Text style={styles.storeName}>
                {item.stores?.store_name ?? 'Tienda'}
              </Text>
              <Text style={styles.muted}>
                {item.stores?.address ??
                  item.stores?.phone ??
                  'Sin ubicación registrada'}
              </Text>
              <Text style={styles.muted}>
                Tope de crédito: {formatCOP(Number(item.credit_limit))}
              </Text>
            </View>
            <Text
              style={[
                styles.balance,
                Number(item.current_balance) === 0 && styles.paid,
              ]}>
              {formatCOP(Number(item.current_balance))}
            </Text>
          </Card>
        )}
        ListFooterComponent={
          <>
            <View style={styles.historyHeading}>
              <View><Text style={styles.section}>Movimientos</Text><Text style={styles.muted}>Fiados y abonos de todas tus tiendas</Text></View>
            </View>
            <View style={styles.filters}>
              {([
                {key: 'all', label: 'Todos'},
                {key: 'credit', label: 'Fiados'},
                {key: 'payment', label: 'Abonos'},
              ] as const).map(filter => <Pressable key={filter.key} onPress={() => setMovementFilter(filter.key)} style={[styles.filter, movementFilter === filter.key && styles.filterActive]}><Text style={[styles.filterText, movementFilter === filter.key && styles.filterTextActive]}>{filter.label}</Text></Pressable>)}
            </View>
            {movements.slice(0, 20).map((item: any) => (
              <Card key={`${item.kind}-${item.id}`} style={styles.movement}>
                <View style={[styles.movementIcon, item.kind === 'payment' && styles.paymentIcon]}><Text style={[styles.movementSymbol, item.kind === 'payment' && styles.paymentSymbol]}>{item.kind === 'payment' ? '↓' : '↑'}</Text></View>
                <View style={{flex: 1}}>
                  <Text style={styles.storeName}>{item.stores?.store_name ?? 'Tienda'}</Text>
                  <Text style={styles.muted} numberOfLines={1}>{item.kind === 'credit' ? item.concept : item.notes || 'Abono registrado'}</Text>
                  <Text style={styles.muted}>{new Date(item.movementDate).toLocaleDateString('es-CO', {day: 'numeric', month: 'short', year: 'numeric'})}</Text>
                </View>
                <Text style={item.kind === 'payment' ? styles.paid : styles.balance}>{item.kind === 'payment' ? '−' : '+'}{formatCOP(Number(item.amount))}</Text>
              </Card>
            ))}
            {movements.length === 0 ? <Card><Text style={styles.muted}>No hay movimientos en este filtro.</Text></Card> : null}
            <Button
              title="Cerrar sesión"
              variant="destructive"
              onPress={logout}
            />
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, gap: 12},
  total: {alignItems: 'center', backgroundColor: '#FFF1E6'},
  label: {color: Colors.textSecondary},
  totalAmount: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.destructive,
    marginTop: 4,
  },
  section: {fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 8},
  historyHeading: {marginTop: 8},
  filters: {flexDirection: 'row', gap: 8, marginBottom: 2},
  filter: {paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card},
  filterActive: {backgroundColor: '#FFF1E6', borderColor: '#FFD5B3'},
  filterText: {fontSize: 12, fontWeight: '600', color: Colors.textSecondary},
  filterTextActive: {color: Colors.primary, fontWeight: '800'},
  store: {flexDirection: 'row', alignItems: 'center', gap: 12},
  movement: {flexDirection: 'row', alignItems: 'center', gap: 12},
  movementIcon: {width: 34, height: 34, borderRadius: 12, backgroundColor: '#FFF1E6', alignItems: 'center', justifyContent: 'center'},
  paymentIcon: {backgroundColor: '#EAF7EE'},
  movementSymbol: {fontSize: 18, fontWeight: '800', color: Colors.primary},
  paymentSymbol: {color: Colors.success},
  storeName: {fontWeight: '700', color: Colors.text},
  muted: {fontSize: 12, color: Colors.textSecondary},
  balance: {fontWeight: '800', color: Colors.destructive},
  paid: {fontWeight: '800', color: '#15803D'},
});
