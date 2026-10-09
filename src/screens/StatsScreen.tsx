import {useQuery} from '@tanstack/react-query';
import {useMemo, useState} from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Header} from '../components/ui/Header';
import {MonochromeIcon} from '../components/ui/MonochromeIcon';
import {fetchCustomers} from '../services/customers';
import {fetchStats, type StatsFilters} from '../services/stats';
import {Colors, formatCOP} from '../theme';

// ──────────────── Helpers ────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const DATE_PRESETS = [
  {label: 'Hoy', from: today(), to: today()},
  {label: 'Últ. 7 días', from: daysAgo(7), to: today()},
  {label: 'Últ. 30 días', from: daysAgo(30), to: today()},
  {label: 'Este mes', from: today().slice(0, 7) + '-01', to: today()},
  {label: 'Todo', from: undefined, to: undefined},
] as const;

// ──────────────── Mini bar chart ────────────────

function BarRow({
  label,
  credits,
  payments,
  maxVal,
}: {
  label: string;
  credits: number;
  payments: number;
  maxVal: number;
}) {
  const ratio = maxVal > 0 ? 1 / maxVal : 0;
  const creditW = Math.max(credits * ratio * 180, credits > 0 ? 4 : 0);
  const paymentW = Math.max(payments * ratio * 180, payments > 0 ? 4 : 0);
  return (
    <View style={bar.row}>
      <Text style={bar.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={bar.bars}>
        <View style={[bar.segment, bar.credit, {width: creditW}]} />
        <View style={[bar.segment, bar.payment, {width: paymentW}]} />
      </View>
    </View>
  );
}

const bar = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8},
  label: {width: 90, fontSize: 11, color: Colors.text, fontWeight: '600'},
  bars: {flex: 1, gap: 3},
  segment: {height: 8, borderRadius: 4, minWidth: 0},
  credit: {backgroundColor: Colors.destructive},
  payment: {backgroundColor: '#15803D'},
});

// ──────────────── Main screen ────────────────

export function StatsScreen({navigation}: any) {
  const insets = useSafeAreaInsets();

  // Filtros activos
  const [preset, setPreset] = useState<number>(2); // default "Últ. 30 días"
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const activePreset = DATE_PRESETS[preset];
  const filters: StatsFilters = {
    from: activePreset.from,
    to: activePreset.to,
    customerIds: selectedIds.length > 0 ? selectedIds : undefined,
  };

  const {data: allCustomers = []} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const {data: stats, isLoading, refetch} = useQuery({
    queryKey: ['stats', filters.from, filters.to, selectedIds],
    queryFn: () => fetchStats(filters),
  });

  const maxVal = useMemo(
    () =>
      Math.max(
        ...(stats?.rows.map(r => Math.max(r.total_credits, r.total_payments)) ?? [1]),
        1,
      ),
    [stats],
  );

  function toggleCustomer(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id],
    );
  }

  const selectedNames = allCustomers
    .filter(c => selectedIds.includes(c.id))
    .map(c => c.alias || c.name);

  return (
    <View style={s.wrap}>
      <Header title="Estadísticas" subtitle="Deudas, abonos y saldo por cliente" />

      <ScrollView
        contentContainerStyle={[s.content, {paddingBottom: insets.bottom + 24}]}
        showsVerticalScrollIndicator={false}>

        {/* ── Selector de periodo ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.presetRow}>
          {DATE_PRESETS.map((p, i) => (
            <Pressable
              key={p.label}
              onPress={() => setPreset(i)}
              style={[s.presetChip, i === preset && s.presetChipActive]}>
              <Text
                style={[
                  s.presetText,
                  i === preset && s.presetTextActive,
                ]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Selector de clientes ── */}
        <Pressable
          onPress={() => setShowCustomerPicker(true)}
          style={s.customerBtn}>
          <MonochromeIcon name="person" color={Colors.primary} size={16} />
          <Text style={s.customerBtnText} numberOfLines={1}>
            {selectedIds.length === 0
              ? 'Todos los clientes'
              : `${selectedIds.length} cliente${selectedIds.length > 1 ? 's' : ''}: ${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? '…' : ''}`}
          </Text>
          <Ionicons name="chevron-down" size={14} color={Colors.primary} />
        </Pressable>

        {/* ── Tarjetas de resumen ── */}
        {isLoading ? (
          <Card>
            <Text style={s.muted}>Calculando estadísticas…</Text>
          </Card>
        ) : (
          <>
            <View style={s.summaryGrid}>
              <Card style={[s.summaryCard, s.summaryDebt]}>
                <Ionicons name="arrow-up-circle-outline" size={24} color={Colors.destructive} />
                <Text style={s.summaryLabel}>TOTAL FIADO</Text>
                <Text style={[s.summaryValue, {color: Colors.destructive}]}>
                  {formatCOP(stats?.totalCredits ?? 0)}
                </Text>
              </Card>
              <Card style={[s.summaryCard, s.summaryPaid]}>
                <Ionicons name="arrow-down-circle-outline" size={24} color="#15803D" />
                <Text style={s.summaryLabel}>TOTAL ABONADO</Text>
                <Text style={[s.summaryValue, {color: '#15803D'}]}>
                  {formatCOP(stats?.totalPayments ?? 0)}
                </Text>
              </Card>
            </View>

            <Card style={s.netCard}>
              <View style={s.netRow}>
                <View style={s.netIcon}>
                  <MonochromeIcon name="wallet" color={Colors.primary} size={20} />
                </View>
                <View style={{flex: 1}}>
                  <Text style={s.netLabel}>SALDO PENDIENTE NETO</Text>
                  <Text style={s.netValue}>
                    {formatCOP(stats?.netBalance ?? 0)}
                  </Text>
                </View>
                <View style={s.countBadge}>
                  <Text style={s.countText}>{stats?.customerCount ?? 0}</Text>
                  <Text style={s.countSub}>clientes</Text>
                </View>
              </View>
            </Card>

            {/* ── Leyenda del gráfico ── */}
            {(stats?.rows.length ?? 0) > 0 && (
              <>
                <View style={s.sectionHead}>
                  <Text style={s.sectionTitle}>Por cliente</Text>
                  <View style={s.legend}>
                    <View style={[s.dot, {backgroundColor: Colors.destructive}]} />
                    <Text style={s.legendText}>Fiado</Text>
                    <View style={[s.dot, {backgroundColor: '#15803D'}]} />
                    <Text style={s.legendText}>Abonado</Text>
                  </View>
                </View>

                <Card style={{gap: 0}}>
                  {(stats?.rows ?? []).slice(0, 12).map(row => (
                    <Pressable
                      key={row.customer_id}
                      onPress={() =>
                        navigation.navigate('CustomerDetail', {id: row.customer_id})
                      }>
                      <View style={s.tableRow}>
                        <View style={{flex: 1, gap: 4}}>
                          <Text style={s.tableName} numberOfLines={1}>
                            {row.alias || row.name}
                          </Text>
                          <BarRow
                            label=""
                            credits={row.total_credits}
                            payments={row.total_payments}
                            maxVal={maxVal}
                          />
                        </View>
                        <View style={s.tableAmounts}>
                          <Text style={s.tableDebt}>
                            {formatCOP(row.balance)}
                          </Text>
                          <Text style={s.tablePayment}>
                            +{formatCOP(row.total_payments)}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </Card>
              </>
            )}

            {(stats?.rows.length ?? 0) === 0 && !isLoading && (
              <Card style={s.emptyCard}>
                <MonochromeIcon
                  name="chart"
                  color={Colors.textSecondary}
                  size={24}
                />
                <Text style={s.emptyTitle}>Sin datos en este período</Text>
                <Text style={s.muted}>
                  Ajusta los filtros de fecha o cliente.
                </Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Modal multi-select clientes ── */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCustomerPicker(false)}>
        <View style={[s.pickerSheet, {paddingTop: insets.top + 8}]}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>Seleccionar clientes</Text>
            <Pressable onPress={() => setShowCustomerPicker(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>
          <Pressable
            style={s.pickerAll}
            onPress={() => setSelectedIds([])}>
            <View style={[s.pickerCheck, selectedIds.length === 0 && s.pickerCheckActive]}>
              {selectedIds.length === 0 && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <Text style={s.pickerAllText}>Todos los clientes</Text>
          </Pressable>
          <FlatList
            data={allCustomers}
            keyExtractor={c => c.id}
            contentContainerStyle={{paddingHorizontal: 16, paddingBottom: 24}}
            renderItem={({item}) => {
              const sel = selectedIds.includes(item.id);
              return (
                <Pressable style={s.pickerRow} onPress={() => toggleCustomer(item.id)}>
                  <View style={[s.pickerCheck, sel && s.pickerCheckActive]}>
                    {sel && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={s.pickerName}>{item.alias || item.name}</Text>
                    {item.alias ? (
                      <Text style={s.pickerSub}>{item.name}</Text>
                    ) : null}
                  </View>
                  <Text style={s.pickerBalance}>
                    {formatCOP(Number(item.current_balance))}
                  </Text>
                </Pressable>
              );
            }}
          />
          <View style={[s.pickerFooter, {paddingBottom: insets.bottom + 12}]}>
            <Pressable
              style={s.pickerDoneBtn}
              onPress={() => {
                setShowCustomerPicker(false);
                refetch();
              }}>
              <Text style={s.pickerDoneText}>
                {selectedIds.length === 0
                  ? 'Ver todos'
                  : `Ver ${selectedIds.length} seleccionado${selectedIds.length > 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  content: {paddingHorizontal: 20, paddingTop: 4, gap: 14},
  // Presets
  presetRow: {gap: 8, paddingRight: 4},
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetChipActive: {
    backgroundColor: '#FFF1E6',
    borderColor: '#FFD5B3',
  },
  presetText: {fontSize: 13, fontWeight: '600', color: Colors.textSecondary},
  presetTextActive: {color: Colors.primary, fontWeight: '800'},
  // Customer selector
  customerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  customerBtnText: {flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600'},
  // Summary cards
  summaryGrid: {flexDirection: 'row', gap: 12},
  summaryCard: {flex: 1, alignItems: 'flex-start', gap: 4},
  summaryDebt: {backgroundColor: '#FFF0EF', borderColor: '#FCCFCC'},
  summaryPaid: {backgroundColor: '#F0FBF4', borderColor: '#BBF0CE'},
  summaryEmoji: {fontSize: 22},
  summaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.7,
  },
  summaryValue: {fontSize: 17, fontWeight: '800'},
  // Net card
  netCard: {backgroundColor: '#FFFAF6', borderColor: '#FFD5B3', borderWidth: 1},
  netRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  netIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  netLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.7,
  },
  netValue: {fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 2},
  countBadge: {alignItems: 'center'},
  countText: {fontSize: 22, fontWeight: '800', color: Colors.text},
  countSub: {fontSize: 10, color: Colors.textSecondary},
  // Section
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {fontSize: 17, fontWeight: '800', color: Colors.text},
  legend: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
  legendText: {fontSize: 11, color: Colors.textSecondary},
  // Table
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  tableName: {fontSize: 12, fontWeight: '700', color: Colors.text},
  tableAmounts: {alignItems: 'flex-end', gap: 2},
  tableDebt: {fontSize: 13, fontWeight: '800', color: Colors.destructive},
  tablePayment: {fontSize: 11, fontWeight: '700', color: '#15803D'},
  // Empty
  emptyCard: {alignItems: 'center', gap: 8, paddingVertical: 24},
  emptyTitle: {fontWeight: '800', color: Colors.text, fontSize: 15},
  muted: {fontSize: 12, color: Colors.textSecondary, textAlign: 'center'},
  // Customer picker modal
  pickerSheet: {flex: 1, backgroundColor: Colors.card},
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerTitle: {fontSize: 20, fontWeight: '800', color: Colors.text},
  pickerAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerAllText: {fontSize: 15, fontWeight: '700', color: Colors.text},
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerCheck: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCheckActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pickerName: {fontSize: 14, fontWeight: '700', color: Colors.text},
  pickerSub: {fontSize: 11, color: Colors.textSecondary},
  pickerBalance: {fontSize: 13, fontWeight: '800', color: Colors.destructive},
  pickerFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  pickerDoneBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickerDoneText: {color: '#fff', fontWeight: '800', fontSize: 15},
});
