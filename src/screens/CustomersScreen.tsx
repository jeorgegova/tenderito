import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../components/ui/Card';
import { Header } from '../components/ui/Header';
import { Input } from '../components/ui/Input';
import { SyncBadge } from '../components/ui/Badge';
import { MagnetFilterBar } from '../components/ui/MagnetFilterBar';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCustomers } from '../services/customers';
import { DynamicBrandCurves } from '../components/ui/DynamicBrandCurves';
import { Colors, Radius, formatCOP } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { CreateCustomerModal } from '../components/CreateCustomerModal';

export function CustomersScreen({ navigation }: any) {
  const { isSmall, isTablet, tabletContainerStyle } = useResponsive();
  const [search, setSearch] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'owing' | 'clear'>(
    'all',
  );
  const [modal, setModal] = useState(false);
  const insets = useSafeAreaInsets();

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(),
  });

  // Botón físico "Atrás" en Clientes: si está en Nuevo Cliente lo cierra, de lo contrario vuelve a Inicio
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (modal) {
          setModal(false);
          return true;
        }
        navigation.navigate('Inicio');
        return true;
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress,
      );
      return () => subscription.remove();
    }, [modal, navigation]),
  );

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CO');
    return (data ?? []).filter(customer => {
      const matchesSearch =
        !query ||
        customer.name.toLocaleLowerCase('es-CO').includes(query) ||
        (customer.alias ?? '').toLocaleLowerCase('es-CO').includes(query) ||
        (customer.document_number ?? '').includes(query) ||
        (customer.phone ?? '').includes(query);
      const hasBalance = Number(customer.current_balance) > 0;
      return (
        matchesSearch &&
        (balanceFilter === 'all' ||
          (balanceFilter === 'owing' ? hasBalance : !hasBalance))
      );
    });
  }, [data, search, balanceFilter]);

  return (
    <View style={styles.wrap}>
      <DynamicBrandCurves position="top-right" />
      <Header title="Clientes" subtitle="Busca y gestiona tus fiados" />
      <View
        style={[
          styles.searchWrap,
          isTablet && { maxWidth: 720, width: '100%', alignSelf: 'center' },
        ]}>
        <Input
          placeholder="Buscar nombre o teléfono"
          value={search}
          onChangeText={setSearch}
          leadingIcon="search"
          returnKeyType="search"
          pill
        />
      </View>
      <View
        style={[
          styles.filterRow,
          isTablet && { maxWidth: 720, width: '100%', alignSelf: 'center' },
        ]}>
        <MagnetFilterBar
          options={[
            { key: 'all', label: `Todos (${data?.length ?? 0})` },
            {
              key: 'owing',
              label: `Con deuda (${
                (data ?? []).filter(c => Number(c.current_balance) > 0).length
              })`,
            },
            {
              key: 'clear',
              label: `Al día (${
                (data ?? []).filter(c => Number(c.current_balance) === 0).length
              })`,
            },
          ]}
          selectedKey={balanceFilter}
          onSelect={key => setBalanceFilter(key as 'all' | 'owing' | 'clear')}
        />
      </View>
      <FlatList
        contentContainerStyle={[styles.listContent, tabletContainerStyle(720)]}
        data={visibleCustomers}
        keyExtractor={i => i.id}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <Card style={styles.emptyContainer}>
              <Ionicons
                name={search ? 'search-outline' : 'people-outline'}
                size={38}
                color={Colors.textMuted}
              />
              <Text style={styles.emptyTitle}>
                {search ? 'Sin coincidencias' : 'Sin clientes registrados'}
              </Text>
              <Text style={styles.emptySub}>
                {search
                  ? 'No encontramos clientes con esa búsqueda. Revisa el nombre o escribe la cédula.'
                  : 'Toca el botón "+ Nuevo cliente" abajo para registrar tu primer cliente.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => {
          const balance = Number(item.current_balance || 0);
          const isOwing = balance > 0;
          return (
            <Pressable
              onPress={() =>
                navigation.navigate('CustomerDetail', { id: item.id })
              }>
              <Card style={styles.customerCardItem}>
                {/* Onda curva decorativa sutil en la esquina superior derecha de la tarjeta */}
                <View
                  pointerEvents="none"
                  style={[
                    styles.cardCornerWave,
                    !isOwing && styles.cardCornerWavePaid,
                  ]}
                />

                <View style={styles.customerCardMainRow}>
                  <View style={[styles.avatar, !isOwing && styles.avatarPaid]}>
                    <Text
                      style={[
                        styles.avatarText,
                        !isOwing && styles.avatarTextPaid,
                      ]}>
                      {(item.alias || item.name).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flexOne}>
                    <View style={styles.nameHeaderRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.alias || item.name}
                      </Text>
                      <SyncBadge estadoServidor={item.estadoServidor} />
                    </View>
                    {item.alias ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        {item.name}
                      </Text>
                    ) : null}
                    <View style={styles.phoneRow}>
                      <Ionicons
                        name="call"
                        size={12}
                        color={Colors.textSecondary}
                      />
                      <Text style={styles.phoneText} numberOfLines={1}>
                        {item.phone || 'Sin teléfono'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.customerCardBalanceCol}>
                    <Text
                      style={[
                        styles.balanceLabel,
                        isOwing
                          ? styles.balanceLabelOwing
                          : styles.balanceLabelPaid,
                      ]}>
                      {isOwing ? 'TE DEBE' : 'AL DÍA'}
                    </Text>
                    <Text
                      style={[
                        styles.balance,
                        isOwing ? styles.balanceOwing : styles.balancePaid,
                      ]}>
                      {formatCOP(balance)}
                    </Text>
                  </View>
                </View>

                {/* Botón de acceso a libreta de cuentas dentro de la tarjeta */}
                <View style={styles.cardFooterHint}>
                  <Text style={styles.cardFooterText}>
                    Ver libreta de cuentas
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.primary}
                  />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
      <Pressable
        onPress={() => setModal(true)}
        accessibilityLabel="Nuevo cliente"
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.fabText}>Nuevo cliente</Text>
      </Pressable>

      <CreateCustomerModal
        visible={modal}
        onClose={() => setModal(false)}
        existingCustomers={data}
        onCustomerCreated={() => {
          setModal(false);
          refetch();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background, overflow: 'hidden' },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 6,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  filterText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  listContent: {
    padding: 20,
    gap: 14,
    paddingBottom: 100,
  },
  flexOne: { flex: 1, minWidth: 0, flexShrink: 1 },
  customerCardItem: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#142033',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardCornerWave: {
    position: 'absolute',
    top: -16,
    right: -16,
    width: 68,
    height: 68,
    borderBottomLeftRadius: 55,
    backgroundColor: '#FFE4D0',
    opacity: 0.65,
  },
  cardCornerWavePaid: {
    backgroundColor: '#D1F5E0',
  },
  customerCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPaid: {
    backgroundColor: Colors.successAlt,
  },
  avatarText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 19,
  },
  avatarTextPaid: {
    color: Colors.success,
  },
  nameHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  phoneText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  customerCardBalanceCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  balanceLabelOwing: {
    color: Colors.destructive,
  },
  balanceLabelPaid: {
    color: Colors.success,
  },
  balance: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  balanceOwing: {
    color: Colors.destructive,
  },
  balancePaid: {
    color: Colors.success,
  },
  cardFooterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8F2',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFEFE5',
  },
  cardFooterText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheet: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  sheetContent: {
    padding: 20,
    gap: 12,
    flexGrow: 1,
    paddingBottom: 40,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 8,
    minWidth: 64,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalFooter: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  label: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  hint: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pickerValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pickerChevron: { fontSize: 16, color: Colors.textSecondary },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  typeOptionSelected: {
    backgroundColor: Colors.primaryLight,
  },
  typeOptionText: { fontSize: 15, color: Colors.text },
  typeOptionTextSelected: { fontWeight: '700', color: Colors.text },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  fabText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },

  // Estilos para cliente ya vinculado
  alreadyLinkedCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: Radius.lg,
    padding: 16,
    gap: 4,
  },
  alreadyLinkedHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  alreadyLinkedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  alreadyLinkedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#166534',
  },
  alreadyLinkedDesc: {
    fontSize: 12,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 17,
  },
  alreadyLinkedDivider: {
    height: 1,
    backgroundColor: '#DCFCE7',
    marginVertical: 10,
  },
  alreadyLinkedInfo: {
    gap: 3,
  },
  alreadyLinkedName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  alreadyLinkedSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  alreadyLinkedBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  alreadyLinkedBalanceLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  alreadyLinkedBalanceValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  alreadyLinkedBalanceOwing: {
    color: Colors.destructive,
  },
  alreadyLinkedBalanceClear: {
    color: '#15803D',
  },
  alreadyLinkedFooter: {
    gap: 10,
    width: '100%',
  },
  alreadyLinkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  alreadyLinkedPillText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  upgradeCard: {
    padding: 24,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: 12,
  },
  upgradeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFEDD5',
  },
  upgradeTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  upgradeText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeBtn: {
    width: '100%',
    marginTop: 6,
  },
});
