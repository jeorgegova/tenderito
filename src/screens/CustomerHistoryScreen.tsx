import {useQuery} from '@tanstack/react-query';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {Card} from '../components/ui/Card';
import {FooterMenu} from '../components/ui/FooterMenu';
import {
  fetchGlobalCustomerHistory,
  fetchCustomerById,
} from '../services/customers';
import {Colors, formatCOP} from '../theme';

export function CustomerHistoryScreen({route}: any) {
  const {id} = route.params as {id: string};
  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomerById(id),
  });
  const history = useQuery({
    queryKey: ['customer-global-history', id],
    queryFn: () => fetchGlobalCustomerHistory(id),
  });
  const stores = history.data?.stores ?? [];

  return (
    <View style={styles.wrap}>
      <FlatList
        contentContainerStyle={styles.content}
        data={stores}
        keyExtractor={(item: any) => item.store_id}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Historial entre tiendas</Text>
            <Text style={styles.customer}>
              {customer.data?.name ?? 'Cliente'}
            </Text>
            <Text style={styles.section}>Tiendas vinculadas</Text>
          </>
        }
        renderItem={({item}: any) => (
          <Card style={styles.store}>
            <View style={{flex: 1}}>
              <Text style={styles.storeName}>{item.store_name}</Text>
              <Text style={styles.muted}>
                {item.address ?? item.phone ?? 'Sin ubicación registrada'}
              </Text>
              <Text style={styles.muted}>
                Último movimiento:{' '}
                {item.last_movement
                  ? new Date(item.last_movement).toLocaleDateString('es-CO')
                  : 'Sin movimientos'}
              </Text>
            </View>
            <Text style={styles.balance}>
              {formatCOP(Number(item.current_balance))}
            </Text>
          </Card>
        )}
        ListFooterComponent={
          <>
            <Text style={styles.section}>Movimientos</Text>
            {(history.data?.credits ?? []).map((item: any) => (
              <Card key={`c-${item.id}`} style={styles.row}>
                <View style={{flex: 1}}>
                  <Text style={styles.storeName}>{item.store_name}</Text>
                  <Text style={styles.muted}>
                    {item.concept} ·{' '}
                    {new Date(item.created_at).toLocaleDateString('es-CO')}
                  </Text>
                </View>
                <Text style={styles.balance}>
                  {formatCOP(Number(item.amount))}
                </Text>
              </Card>
            ))}
            {(history.data?.payments ?? []).map((item: any) => (
              <Card key={`p-${item.id}`} style={styles.row}>
                <View style={{flex: 1}}>
                  <Text style={styles.storeName}>{item.store_name}</Text>
                  <Text style={styles.muted}>
                    Abono ·{' '}
                    {new Date(item.payment_date).toLocaleDateString('es-CO')}
                  </Text>
                </View>
                <Text style={styles.paid}>
                  -{formatCOP(Number(item.amount))}
                </Text>
              </Card>
            ))}
          </>
        }
      />
      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, gap: 12},
  title: {fontSize: 24, fontWeight: '800', color: Colors.text},
  customer: {color: Colors.textSecondary},
  section: {fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 12},
  store: {flexDirection: 'row', alignItems: 'center', gap: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  storeName: {fontWeight: '700', color: Colors.text},
  muted: {fontSize: 12, color: Colors.textSecondary},
  balance: {fontWeight: '800', color: Colors.destructive},
  paid: {fontWeight: '800', color: '#15803D'},
});
