import {useQuery} from '@tanstack/react-query';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {Card} from '../components/ui/Card';
import {FooterMenu} from '../components/ui/FooterMenu';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import Ionicons from '@react-native-vector-icons/ionicons';
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
  const totalBalance = stores.reduce(
    (sum: number, s: any) => sum + Number(s.current_balance ?? 0),
    0,
  );

  return (
    <View style={styles.wrap}>
      <FlatList
        contentContainerStyle={styles.content}
        data={stores}
        keyExtractor={(item: any) => item.store_id}
        ListHeaderComponent={
          <>
            {/* Cabecera del cliente */}
            <View style={styles.headerWrap}>
              <View style={styles.avatarLg}>
                <Text style={styles.avatarLgText}>
                  {(customer.data?.alias || customer.data?.name || '?')
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title}>
                {customer.data?.alias || customer.data?.name || '…'}
              </Text>
              {customer.data?.alias ? (
                <Text style={styles.subtitle}>{customer.data.name}</Text>
              ) : null}
              <Text style={styles.subtitle}>
                {customer.data?.phone ?? 'Sin teléfono'}
              </Text>
            </View>

            {/* Resumen total */}
            <Card style={styles.totalCard}>
              <View style={styles.totalRow}>
                <View style={styles.totalIcon}>
                  <MonochromeIcon name="wallet" color={Colors.primary} size={18} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.totalLabel}>
                    DEUDA TOTAL EN TODAS LAS TIENDAS
                  </Text>
                  <Text style={styles.totalValue}>{formatCOP(totalBalance)}</Text>
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>Tiendas vinculadas</Text>

            {history.isLoading ? (
              <Card>
                <Text style={styles.muted}>Cargando historial…</Text>
              </Card>
            ) : stores.length === 0 ? (
              <Card style={styles.emptyCard}>
                <MonochromeIcon name="check" color={Colors.success} size={20} />
                <Text style={styles.emptyText}>
                  Sin tiendas vinculadas en Tenderito.
                </Text>
              </Card>
            ) : null}
          </>
        }
        renderItem={({item}: any) => (
          <Card style={styles.storeCard}>
            <View style={styles.storeIconWrap}>
              <MonochromeIcon name="store" color={Colors.primary} size={20} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.storeName}>{item.store_name}</Text>
              <Text style={styles.storeMeta}>
                Último mov.:{' '}
                {item.last_movement
                  ? new Date(item.last_movement).toLocaleDateString('es-CO', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Sin movimientos'}
              </Text>
            </View>
            <View style={styles.balanceCol}>
              <Text
                style={[
                  styles.balance,
                  Number(item.current_balance) === 0 && styles.balancePaid,
                ]}>
                {formatCOP(Number(item.current_balance))}
              </Text>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 3}}>
                {Number(item.current_balance) === 0 ? (
                  <>
                    <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                    <Text style={[styles.balanceLabel, styles.balancePaid]}>Al día</Text>
                  </>
                ) : (
                  <Text style={styles.balanceLabel}>Pendiente</Text>
                )}
              </View>
            </View>
          </Card>
        )}
        ListFooterComponent={<View style={{height: 32}} />}
      />
      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {padding: 20, gap: 12},
  headerWrap: {alignItems: 'center', paddingVertical: 8, gap: 4},
  avatarLg: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarLgText: {fontSize: 26, fontWeight: '800', color: Colors.primary},
  title: {fontSize: 22, fontWeight: '800', color: Colors.text},
  subtitle: {fontSize: 13, color: Colors.textSecondary},
  totalCard: {
    backgroundColor: '#FFFAF6',
    borderColor: '#FFD5B3',
    borderWidth: 1,
  },
  totalRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  totalIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  totalValue: {fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 2},
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
  },
  storeCard: {flexDirection: 'row', alignItems: 'center', gap: 12},
  storeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: {fontWeight: '700', color: Colors.text, fontSize: 14},
  storeMeta: {fontSize: 11, color: Colors.textSecondary, marginTop: 2},
  balanceCol: {alignItems: 'flex-end', gap: 2},
  balance: {fontWeight: '800', color: Colors.destructive, fontSize: 14},
  balancePaid: {color: '#15803D'},
  balanceLabel: {fontSize: 10, color: Colors.textSecondary},
  emptyCard: {alignItems: 'center', flexDirection: 'row', gap: 10},
  emptyText: {color: Colors.textSecondary, fontSize: 13},
  muted: {color: Colors.textSecondary, fontSize: 13},
});
