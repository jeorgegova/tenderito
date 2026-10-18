import {useQuery} from '@tanstack/react-query';
import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {SyncBadge} from '../components/ui/Badge';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {FooterMenu} from '../components/ui/FooterMenu';
import {showAlert} from '../utils/alert';
import {fetchCreditsByCustomer} from '../services/credits';
import {fetchCustomerById} from '../services/customers';
import {fetchPaymentsByCustomer} from '../services/payments';
import {useStore} from '../store/useStore';
import {Colors, Radius, formatCOP} from '../theme';

export function CustomerDetailScreen({route, navigation}: any) {
  const {id} = route.params as {id: string};
  const profile = useStore(s => s.profile);
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'payment'>(
    'all',
  );

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

  // Movimientos combinados y ordenados por fecha más reciente
  const allMovements = useMemo(() => {
    const cr = (credits.data ?? []).map(c => ({
      id: c.id,
      kind: 'credit' as const,
      title: c.concept || 'Compra fiada',
      amount: Number(c.amount || 0),
      date: c.created_at,
      dueDate: c.due_date,
      estadoServidor: c.estadoServidor,
      notes: null,
    }));

    const py = (payments.data ?? []).map(p => ({
      id: p.id,
      kind: 'payment' as const,
      title: p.notes ? `Abono: ${p.notes}` : 'Abono recibido',
      amount: Number(p.amount || 0),
      date: p.payment_date,
      dueDate: null,
      estadoServidor: p.estadoServidor,
      notes: p.notes,
    }));

    return [...cr, ...py].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [credits.data, payments.data]);

  // Totales acumulados
  const totals = useMemo(() => {
    let creditsSum = 0;
    let paymentsSum = 0;
    allMovements.forEach(m => {
      if (m.kind === 'credit') {
        creditsSum += m.amount;
      }
      if (m.kind === 'payment') {
        paymentsSum += m.amount;
      }
    });
    return {creditsSum, paymentsSum};
  }, [allMovements]);

  // Movimientos según filtro
  const filteredMovements = useMemo(() => {
    if (filterType === 'all') {
      return allMovements;
    }
    return allMovements.filter(m => m.kind === filterType);
  }, [allMovements, filterType]);

  const creditCount = allMovements.filter(m => m.kind === 'credit').length;
  const paymentCount = allMovements.filter(m => m.kind === 'payment').length;

  const currentBalance = Number(customer.data?.current_balance ?? 0);
  const creditLimit = Number(customer.data?.credit_limit ?? 0);
  const isPaid = currentBalance === 0;

  const handleCallCustomer = (phone?: string | null) => {
    if (!phone) {
      return;
    }
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      showAlert('No se pudo abrir el teléfono', `Número: ${phone}`);
    });
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch (_e) {
      return dateStr;
    }
  };

  const isOverdue = (dueDateStr?: string | null) => {
    if (!dueDateStr) {
      return false;
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      return dueDateStr < today;
    } catch (_e) {
      return false;
    }
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        contentContainerStyle={styles.content}
        data={filteredMovements}
        keyExtractor={item => `${item.kind}-${item.id}`}
        refreshing={
          customer.isLoading || credits.isLoading || payments.isLoading
        }
        onRefresh={() => {
          customer.refetch();
          credits.refetch();
          payments.refetch();
        }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ── Ficha del Cliente ── */}
            <Card style={styles.customerCard}>
              <View style={styles.customerRow}>
                <View
                  style={[styles.avatar, isPaid ? styles.avatarPaid : null]}>
                  <Text
                    style={[
                      styles.avatarText,
                      isPaid ? styles.avatarTextPaid : null,
                    ]}>
                    {(customer.data?.alias || customer.data?.name || '?')
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.customerName}>
                    {customer.data?.alias ||
                      customer.data?.name ||
                      'Cargando...'}
                  </Text>
                  {customer.data?.alias ? (
                    <Text style={styles.customerRealName}>
                      Nombre real: {customer.data.name}
                    </Text>
                  ) : null}
                  <Text style={styles.customerMeta}>
                    {customer.data?.document_type || 'CC'}{' '}
                    {customer.data?.document_number || 'Sin cédula'}
                  </Text>
                </View>
              </View>

              {/* Botón rápido para llamar al cliente */}
              {customer.data?.phone ? (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => handleCallCustomer(customer.data?.phone)}>
                  <Ionicons name="call" size={15} color="#15803D" />
                  <Text style={styles.callBtnText}>
                    Llamar al cliente ({customer.data.phone})
                  </Text>
                </TouchableOpacity>
              ) : null}

              {/* Historial en otras tiendas (si aplica plan de pago) */}
              {(profile?.subscription_plan ?? 'free') !== 'free' ? (
                <TouchableOpacity
                  style={styles.historyBtn}
                  onPress={() => navigation.navigate('CustomerHistory', {id})}>
                  <Ionicons
                    name="storefront-outline"
                    size={15}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.historyBtnText}>
                    Historial en otras tiendas
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={Colors.textMuted}
                  />
                </TouchableOpacity>
              ) : null}

              {/* Caja de Deuda / Saldo en Grande y Claro */}
              <View
                style={[
                  styles.balanceBox,
                  isPaid ? styles.balanceBoxPaid : null,
                ]}>
                <Text
                  style={[
                    styles.balanceBoxLabel,
                    isPaid ? styles.balanceBoxLabelPaid : null,
                  ]}>
                  {isPaid
                    ? '¡ESTE CLIENTE ESTÁ AL DÍA!'
                    : 'ESTE CLIENTE TE DEBE:'}
                </Text>
                <Text
                  style={[
                    styles.balanceBoxAmount,
                    isPaid ? styles.balanceBoxAmountPaid : null,
                  ]}>
                  {formatCOP(currentBalance)}
                </Text>
                <Text style={styles.balanceBoxHelp}>
                  {isPaid
                    ? 'No tiene ninguna deuda pendiente contigo en este momento.'
                    : 'Es el valor total que tiene pendiente por pagar en tu tienda.'}
                  {creditLimit > 0
                    ? ` (Tope máximo de crédito permitido: ${formatCOP(
                        creditLimit,
                      )})`
                    : ''}
                </Text>
              </View>
            </Card>

            {/* ── Botones de Acción Principales (Grandes y Cómodos) ── */}
            <View style={styles.actionsRow}>
              <View style={styles.flexOne}>
                <Button
                  title="+ Nuevo fiado"
                  icon="credit"
                  onPress={() =>
                    navigation.navigate('NewCredit', {customerId: id})
                  }
                />
              </View>
              <View style={styles.flexOne}>
                <Button
                  title="− Abonar plata"
                  variant="secondary"
                  icon="incoming"
                  onPress={() =>
                    navigation.navigate('NewPayment', {customerId: id})
                  }
                />
              </View>
            </View>

            {/* ── Encabezado de la Libreta de Cuentas ── */}
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>
                Libreta de fiados y abonos
              </Text>
              <Text style={styles.sectionSubtitle}>
                Aquí ves cada compra fiada y cada abono recibido:
              </Text>
            </View>

            {/* ── Filtros Rápidos y Comprensibles ── */}
            <View style={styles.filterBar}>
              <Pressable
                onPress={() => setFilterType('all')}
                style={[
                  styles.filterChip,
                  filterType === 'all' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'all' && styles.filterChipTextActive,
                  ]}>
                  Todo ({allMovements.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterType('credit')}
                style={[
                  styles.filterChip,
                  filterType === 'credit' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'credit' && styles.filterChipTextActive,
                  ]}>
                  Solo compras ({creditCount})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setFilterType('payment')}
                style={[
                  styles.filterChip,
                  filterType === 'payment' && styles.filterChipActive,
                ]}>
                <Text
                  style={[
                    styles.filterChipText,
                    filterType === 'payment' && styles.filterChipTextActive,
                  ]}>
                  Solo abonos ({paymentCount})
                </Text>
              </Pressable>
            </View>

            {/* ── Cabecera de la Tabla Libreta ── */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableColHeader, styles.colDate]}>FECHA</Text>
              <Text style={[styles.tableColHeader, styles.colConcept]}>
                QUÉ SE LLEVÓ / ABONO
              </Text>
              <Text style={[styles.tableColHeader, styles.colAmount]}>
                VALOR
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          !credits.isLoading && !payments.isLoading ? (
            <View style={styles.tableEmpty}>
              <Ionicons
                name="receipt-outline"
                size={36}
                color={Colors.textMuted}
              />
              <Text style={styles.tableEmptyTitle}>Sin movimientos</Text>
              <Text style={styles.tableEmptyText}>
                {filterType === 'all'
                  ? 'Este cliente aún no tiene compras fiadas ni abonos registrados.'
                  : 'No hay registros en este filtro seleccionado.'}
              </Text>
            </View>
          ) : (
            <View style={styles.tableEmpty}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.tableEmptyText}>Cargando libreta...</Text>
            </View>
          )
        }
        renderItem={({item, index}) => {
          const isCredit = item.kind === 'credit';
          const overdue = isCredit && isOverdue(item.dueDate);

          return (
            <View
              style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
              {/* Columna Fecha */}
              <View style={styles.colDate}>
                <Text style={styles.rowDateText}>
                  {formatDateDisplay(item.date)}
                </Text>
              </View>

              {/* Columna Detalle */}
              <View style={styles.colConcept}>
                <Text style={styles.rowConceptTitle} numberOfLines={2}>
                  {item.title}
                </Text>

                <View style={styles.rowBadgeWrap}>
                  <View
                    style={[
                      styles.kindBadge,
                      isCredit
                        ? styles.kindBadgeCredit
                        : styles.kindBadgePayment,
                    ]}>
                    <Text
                      style={[
                        styles.kindBadgeText,
                        isCredit
                          ? styles.kindBadgeTextCredit
                          : styles.kindBadgeTextPayment,
                      ]}>
                      {isCredit ? 'Compra fiada (+)' : 'Abono recibido (-)'}
                    </Text>
                  </View>
                  <SyncBadge estadoServidor={item.estadoServidor} />
                </View>

                {item.dueDate ? (
                  <View style={styles.dueRow}>
                    <Ionicons
                      name="calendar-outline"
                      size={12}
                      color={
                        overdue ? Colors.destructive : Colors.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.rowDueDate,
                        overdue && styles.rowDueDateOverdue,
                      ]}>
                      {overdue
                        ? `Vencido el: ${formatDateDisplay(item.dueDate)}`
                        : `Vence el: ${formatDateDisplay(item.dueDate)}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Columna Monto */}
              <View style={styles.colAmount}>
                <Text
                  style={[
                    styles.rowAmountText,
                    isCredit ? styles.rowAmountCredit : styles.rowAmountPayment,
                  ]}>
                  {isCredit ? '+' : '−'}
                  {formatCOP(item.amount)}
                </Text>
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          allMovements.length > 0 ? (
            <View style={styles.tableSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total fiado acumulado:</Text>
                <Text style={styles.summaryCreditValue}>
                  +{formatCOP(totals.creditsSum)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Total que te ha abonado:
                </Text>
                <Text style={styles.summaryPaymentValue}>
                  −{formatCOP(totals.paymentsSum)}
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryNetLabel}>
                  Saldo pendiente actual:
                </Text>
                <Text
                  style={[
                    styles.summaryNetValue,
                    isPaid
                      ? styles.summaryNetValuePaid
                      : styles.summaryNetValueOwing,
                  ]}>
                  {formatCOP(currentBalance)}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
      />
      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flexOne: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
    paddingBottom: 48,
  },

  // Ficha del Cliente
  customerCard: {
    padding: 18,
    gap: 12,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPaid: {
    backgroundColor: '#DCFCE7',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  avatarTextPaid: {
    color: Colors.success,
  },
  customerName: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.text,
  },
  customerRealName: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 1,
  },
  customerMeta: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  callBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  historyBtnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Caja de saldo
  balanceBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  balanceBoxPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  balanceBoxLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.destructive,
    letterSpacing: 0.8,
  },
  balanceBoxLabelPaid: {
    color: '#15803D',
  },
  balanceBoxAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.destructive,
    marginVertical: 4,
  },
  balanceBoxAmountPaid: {
    color: '#15803D',
  },
  balanceBoxHelp: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Botones de acción principales (con margen claro y amplio)
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    marginBottom: 16,
  },

  // Título de la sección
  sectionHeading: {
    marginTop: 4,
    marginBottom: 8,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // Barra de filtros
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },

  // Tabla Libreta de Cuentas
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 0.6,
  },
  colDate: {
    width: 82,
  },
  colConcept: {
    flex: 1,
    paddingHorizontal: 6,
  },
  colAmount: {
    width: 95,
    alignItems: 'flex-end',
  },

  // Filas de la tabla
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  rowDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  rowConceptTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  rowBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  kindBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  kindBadgeCredit: {
    backgroundColor: '#FEE2E2',
  },
  kindBadgePayment: {
    backgroundColor: '#DCFCE7',
  },
  kindBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kindBadgeTextCredit: {
    color: Colors.destructive,
  },
  kindBadgeTextPayment: {
    color: '#15803D',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  rowDueDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  rowDueDateOverdue: {
    color: Colors.destructive,
    fontWeight: '700',
  },
  rowAmountText: {
    fontSize: 14,
    fontWeight: '800',
  },
  rowAmountCredit: {
    color: Colors.destructive,
  },
  rowAmountPayment: {
    color: '#15803D',
  },

  // Estado vacío de la tabla
  tableEmpty: {
    backgroundColor: Colors.card,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  tableEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  tableEmptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Resumen inferior de la libreta
  tableSummary: {
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: 14,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  summaryCreditValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.destructive,
  },
  summaryPaymentValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  summaryNetLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  summaryNetValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  summaryNetValueOwing: {
    color: Colors.destructive,
  },
  summaryNetValuePaid: {
    color: '#15803D',
  },
  footerSpacer: {
    height: 16,
  },
});
