import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef } from 'react';
import { FlatList, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../components/ui/Card';
import { FooterMenu } from '../components/ui/FooterMenu';
import { MonochromeIcon } from '../components/ui/MonochromeIcon';
import Ionicons from '@react-native-vector-icons/ionicons';
import {
  fetchGlobalCustomerHistory,
  fetchCustomerById,
  getStoreBalance,
  getStoreLastMovement,
  evaluateCustomerPaymentHabit,
} from '../services/customers';
import { Colors, formatCOP } from '../theme';
import { useResponsive } from '../hooks/useResponsive';
import { formatDateDisplay } from '../utils/format';

function formatLastMovement(lastMovement?: string | null): string {
  if (!lastMovement) {
    return 'Sin movimientos';
  }
  const str = String(lastMovement).trim().toLowerCase();
  if (
    str.includes('infinity') ||
    str === 'null' ||
    str === 'undefined' ||
    str === ''
  ) {
    return 'Sin movimientos';
  }
  const formatted = formatDateDisplay(lastMovement);
  return formatted && formatted !== 'Sin fecha' ? formatted : 'Sin movimientos';
}

export function CustomerHistoryScreen({ route }: any) {
  const { isTablet, tabletContainerStyle } = useResponsive();
  const listRef = useRef<FlatList>(null);

  useFocusEffect(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, []),
  );
  const { id, customer: initialCustomer } = (route.params || {}) as {
    id: string;
    customer?: any;
  };
  const customer = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomerById(id),
    initialData: initialCustomer,
  });
  const history = useQuery({
    queryKey: ['customer-global-history', id],
    queryFn: () => fetchGlobalCustomerHistory(id),
  });
  const stores = history.data?.stores ?? [];
  const credits = history.data?.credits ?? [];
  const payments = history.data?.payments ?? [];
  const totalBalance = stores.reduce(
    (sum: number, s: any) => sum + getStoreBalance(s, credits, payments),
    0,
  );
  const paymentRating = evaluateCustomerPaymentHabit(stores, credits, payments);

  const ratingIconName =
    paymentRating.tier === 'excellent'
      ? 'shield-checkmark'
      : paymentRating.tier === 'good'
        ? 'thumbs-up'
        : paymentRating.tier === 'fair'
          ? 'alert-circle'
          : paymentRating.tier === 'risk'
            ? 'warning'
            : 'help-circle-outline';

  const customerData = customer.data || initialCustomer || (history.data as any)?.customer;
  const displayName =
    customerData?.alias || customerData?.name || (customer.isLoading ? 'Cargando…' : 'Cliente');
  const realName =
    customerData?.alias && customerData?.name ? customerData.name : null;
  const phone = customerData?.phone ?? 'Sin teléfono';
  const documentInfo = customerData?.document_number
    ? `${customerData.document_type || 'CC'} ${customerData.document_number}`
    : null;
  const initialChar = (displayName || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        contentContainerStyle={[styles.content, tabletContainerStyle(640)]}
        data={stores}
        keyExtractor={(item: any) => item.store_id}
        ListHeaderComponent={
          <>
            {/* Cabecera del cliente */}
            <View style={styles.headerWrap}>
              <View style={styles.avatarLg}>
                <Text style={styles.avatarLgText}>{initialChar}</Text>
              </View>
              <Text style={styles.title}>{displayName}</Text>
              {realName ? (
                <Text style={styles.subtitle}>{realName}</Text>
              ) : null}
              <Text style={styles.subtitle}>
                {documentInfo ? `${documentInfo} · ${phone}` : phone}
              </Text>
            </View>

            {/* Resumen total */}
            <Card style={styles.totalCard}>
              <View style={styles.totalRow}>
                <View style={styles.totalIcon}>
                  <MonochromeIcon name="wallet" color={Colors.primary} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.totalLabel}>
                    DEUDA TOTAL EN TODAS LAS TIENDAS
                  </Text>
                  <Text style={styles.totalValue}>{formatCOP(totalBalance)}</Text>
                </View>
              </View>
            </Card>

            {/* Valoración de hábitos de pago */}
            {!history.isLoading ? (
              <Card
                style={[
                  styles.ratingCard,
                  { borderColor: paymentRating.borderColor },
                ]}>
                <View style={styles.ratingHeaderRow}>
                  <View style={styles.ratingTitleGroup}>
                    <View
                      style={[
                        styles.ratingIconBox,
                        { backgroundColor: paymentRating.bgColor },
                      ]}>
                      <Ionicons
                        name={ratingIconName as any}
                        size={20}
                        color={paymentRating.color}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ratingOverline}>
                        VALORACIÓN DE PAGO
                      </Text>
                      <Text
                        style={[
                          styles.ratingLabel,
                          { color: paymentRating.color },
                        ]}>
                        {paymentRating.label}
                      </Text>
                    </View>
                  </View>

                  {paymentRating.score !== null ? (
                    <View
                      style={[
                        styles.ratingScorePill,
                        {
                          backgroundColor: paymentRating.bgColor,
                          borderColor: paymentRating.borderColor,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.ratingScoreText,
                          { color: paymentRating.color },
                        ]}>
                        {paymentRating.score} / 100
                      </Text>
                    </View>
                  ) : null}
                </View>

                {paymentRating.score !== null ? (
                  <View style={styles.ratingBarTrack}>
                    <View
                      style={[
                        styles.ratingBarFill,
                        {
                          width: `${paymentRating.score}%`,
                          backgroundColor: paymentRating.color,
                        },
                      ]}
                    />
                  </View>
                ) : null}

                <Text style={styles.ratingDesc}>
                  {paymentRating.description}
                </Text>

                <View style={styles.ratingMetricsRow}>
                  <View style={styles.ratingMetricBox}>
                    <Text style={styles.ratingMetricLabel}>ABONADO</Text>
                    <Text
                      style={styles.ratingMetricValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}>
                      {paymentRating.paymentPercentage}%
                    </Text>
                  </View>
                  <View style={styles.ratingMetricBox}>
                    <Text style={styles.ratingMetricLabel}>ABONOS / FIADOS</Text>
                    <Text
                      style={styles.ratingMetricValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}>
                      {paymentRating.paymentsCount} / {paymentRating.creditsCount}
                    </Text>
                  </View>
                  <View style={styles.ratingMetricBox}>
                    <Text style={styles.ratingMetricLabel}>ATRASOS</Text>
                    <Text
                      style={[
                        styles.ratingMetricValue,
                        {
                          color:
                            paymentRating.overdueCount > 0
                              ? Colors.destructive
                              : '#15803D',
                        },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}>
                      {paymentRating.overdueCount === 0
                        ? 'Sin atrasos'
                        : `${paymentRating.overdueCount} vencido${paymentRating.overdueCount === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                </View>
              </Card>
            ) : null}

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
        renderItem={({ item }: any) => {
          const bal = getStoreBalance(item, credits, payments);
          const isPaid = bal === 0;
          const lastMov = getStoreLastMovement(item, credits, payments);
          return (
            <Card style={styles.storeCard}>
              <View style={styles.storeIconWrap}>
                <MonochromeIcon name="store" color={Colors.primary} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.storeName}>{item.store_name}</Text>
                {item.phone ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`tel:${item.phone}`).catch(() => {})}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 2,
                    }}>
                    <Ionicons name="call-outline" size={12} color={Colors.primary} />
                    <Text
                      style={{
                        fontSize: 12,
                        color: Colors.primary,
                        fontWeight: '600',
                      }}>
                      {item.phone}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.storeMeta}>
                  Último mov.: {lastMov}
                </Text>
              </View>
              <View style={styles.balanceCol}>
                <Text
                  style={[
                    styles.balance,
                    isPaid && styles.balancePaid,
                  ]}>
                  {formatCOP(bal)}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  {isPaid ? (
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
          );
        }}
        ListFooterComponent={<View style={{ height: 32 }} />}
      />
      <FooterMenu active="Clientes" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, gap: 12, paddingBottom: 110 },
  headerWrap: { alignItems: 'center', paddingVertical: 8, gap: 4 },
  avatarLg: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarLgText: { fontSize: 26, fontWeight: '800', color: Colors.primary },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textSecondary },
  totalCard: {
    backgroundColor: Colors.card,
    borderColor: '#F1F5F9',
    borderWidth: 1,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.8,
  },
  totalValue: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 2 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
  },
  storeCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeName: { fontWeight: '700', color: Colors.text, fontSize: 14 },
  storeMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  balanceCol: { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  balance: { fontWeight: '800', color: Colors.destructive, fontSize: 14 },
  balancePaid: { color: '#15803D' },
  balanceLabel: { fontSize: 10, color: Colors.textSecondary },
  emptyCard: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  emptyText: { color: Colors.textSecondary, fontSize: 13 },
  muted: { color: Colors.textSecondary, fontSize: 13 },
  ratingCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    gap: 10,
  },
  ratingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  ratingTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 170,
  },
  ratingIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ratingOverline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: Colors.textSecondary,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 1,
  },
  ratingScorePill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  ratingScoreText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  ratingBarTrack: {
    width: '100%',
    height: 7,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: 999,
  },
  ratingDesc: {
    fontSize: 12.5,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  ratingMetricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingMetricBox: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ratingMetricLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  ratingMetricValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
});
