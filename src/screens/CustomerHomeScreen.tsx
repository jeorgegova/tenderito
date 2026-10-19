import {useQuery} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {showAlert} from '../utils/alert';
import {confirmLogout, CUSTOMER_LOGOUT_MESSAGE} from '../lib/session';
import {fetchCustomerPortal} from '../services/customerPortal';
import {Colors, Radius, formatCOP} from '../theme';
import {useFocusEffect} from '@react-navigation/native';

export function CustomerHomeScreen() {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'payment'>(
    'all',
  );

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['customer-portal'],
    queryFn: fetchCustomerPortal,
  });

  // Manejo del botón físico "Atrás" en Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (selectedStoreId) {
          setSelectedStoreId(null);
          return true;
        }
        confirmLogout({
          title: '¿Seguro que deseas cerrar sesión?',
          message: CUSTOMER_LOGOUT_MESSAGE,
          confirmText: 'Cerrar sesión',
        });
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [selectedStoreId]),
  );

  const stores = useMemo(() => data?.stores ?? [], [data?.stores]);
  const customerName = data?.customer?.name ?? 'Cliente';

  // Total acumulado que debe en todas las tiendas
  const totalBalance = useMemo(() => {
    return stores.reduce(
      (sum: number, item: any) => sum + Number(item.current_balance || 0),
      0,
    );
  }, [stores]);

  // Tienda actualmente seleccionada
  const selectedStore = useMemo(() => {
    if (!selectedStoreId) {
      return null;
    }
    return stores.find((s: any) => s.store_id === selectedStoreId) ?? null;
  }, [selectedStoreId, stores]);

  // Movimientos correspondientes a la tienda seleccionada
  const storeMovements = useMemo(() => {
    if (!selectedStoreId) {
      return [];
    }

    const credits = (data?.credits ?? [])
      .filter((c: any) => c.store_id === selectedStoreId)
      .map((c: any) => ({
        id: c.id,
        kind: 'credit' as const,
        title: c.concept || 'Compra fiada',
        amount: Number(c.amount || 0),
        date: c.created_at,
        dueDate: c.due_date,
        notes: null,
      }));

    const payments = (data?.payments ?? [])
      .filter((p: any) => p.store_id === selectedStoreId)
      .map((p: any) => ({
        id: p.id,
        kind: 'payment' as const,
        title: p.notes ? `Abono: ${p.notes}` : 'Abono entregado a la tienda',
        amount: Number(p.amount || 0),
        date: p.payment_date,
        dueDate: null,
        notes: p.notes,
      }));

    return [...credits, ...payments].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [data, selectedStoreId]);

  // Totales de la tienda seleccionada
  const storeTotals = useMemo(() => {
    let creditsSum = 0;
    let paymentsSum = 0;
    storeMovements.forEach(m => {
      if (m.kind === 'credit') {
        creditsSum += m.amount;
      }
      if (m.kind === 'payment') {
        paymentsSum += m.amount;
      }
    });
    return {creditsSum, paymentsSum};
  }, [storeMovements]);

  // Movimientos filtrados para la tienda seleccionada
  const filteredStoreMovements = useMemo(() => {
    if (filterType === 'all') {
      return storeMovements;
    }
    return storeMovements.filter(m => m.kind === filterType);
  }, [storeMovements, filterType]);

  // Función para cerrar sesión con confirmación
  const handleLogout = useCallback(() => {
    confirmLogout({message: CUSTOMER_LOGOUT_MESSAGE});
  }, []);

  const handleCallStore = (phone?: string | null) => {
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

  if (isLoading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>
          Cargando tus cuentas y tiendas...
        </Text>
      </View>
    );
  }

  // =========================================================================
  // VISTA 2: DETALLE DE MOVIMIENTOS DE LA TIENDA SELECCIONADA ("Libreta")
  // =========================================================================
  if (selectedStore) {
    const rawStores: any = selectedStore.stores;
    const storeInfo: any = Array.isArray(rawStores) ? rawStores[0] : rawStores;
    const storeName = storeInfo?.store_name ?? 'Tienda de barrio';
    const currentBalance = Number(selectedStore.current_balance || 0);
    const creditLimit = Number(selectedStore.credit_limit || 0);
    const isPaid = currentBalance === 0;

    const creditCount = storeMovements.filter(m => m.kind === 'credit').length;
    const paymentCount = storeMovements.filter(
      m => m.kind === 'payment',
    ).length;

    return (
      <View style={styles.wrap}>
        {/* Barra superior amigable para volver */}
        <View style={styles.topNav}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setSelectedStoreId(null)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Ionicons name="arrow-back" size={20} color={Colors.primary} />
            <Text style={styles.backBtnText}>Volver a mis tiendas</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.detailScroll}
          showsVerticalScrollIndicator={false}>
          {/* Tarjeta de la tienda */}
          <Card style={styles.storeDetailCard}>
            <View style={styles.storeDetailHeader}>
              <View style={styles.storeDetailAvatar}>
                <Ionicons name="storefront" size={26} color={Colors.primary} />
              </View>
              <View style={styles.flexOne}>
                <Text style={styles.storeDetailTitle}>{storeName}</Text>
                {storeInfo?.address ? (
                  <View style={styles.metaRow}>
                    <Ionicons
                      name="location-outline"
                      size={14}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaText}>{storeInfo.address}</Text>
                  </View>
                ) : null}
                {storeInfo?.phone ? (
                  <View style={styles.metaRow}>
                    <Ionicons
                      name="call-outline"
                      size={14}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.metaText}>{storeInfo.phone}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {storeInfo?.phone ? (
              <TouchableOpacity
                style={styles.callStoreBtn}
                onPress={() => handleCallStore(storeInfo.phone)}>
                <Ionicons name="call" size={16} color="#FFFFFF" />
                <Text style={styles.callStoreBtnText}>Llamar a la tienda</Text>
              </TouchableOpacity>
            ) : null}

            {/* Saldo en grande y claro */}
            <View
              style={[
                styles.storeBalanceBox,
                isPaid ? styles.storeBalanceBoxPaid : null,
              ]}>
              <Text
                style={[
                  styles.storeBalanceLabel,
                  isPaid ? styles.storeBalanceLabelPaid : null,
                ]}>
                {isPaid
                  ? '¡ESTÁS AL DÍA EN ESTA TIENDA!'
                  : 'EN ESTA TIENDA DEBES:'}
              </Text>
              <Text
                style={[
                  styles.storeBalanceAmount,
                  isPaid ? styles.storeBalanceAmountPaid : null,
                ]}>
                {formatCOP(currentBalance)}
              </Text>
              <Text style={styles.storeBalanceHelp}>
                {isPaid
                  ? 'No tienes ninguna deuda pendiente con este tendero.'
                  : 'Este es el dinero que te falta por pagar.'}
                {creditLimit > 0
                  ? ` Tu tope máximo de fiado aquí es de ${formatCOP(
                      creditLimit,
                    )}.`
                  : ''}
              </Text>
            </View>
          </Card>

          {/* Sección de la libreta de cuentas */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionMainTitle}>
                Libreta de tus cuentas
              </Text>
              <Text style={styles.sectionSubtitle}>
                Aquí ves exactamente cada compra y cada abono registrado:
              </Text>
            </View>
          </View>

          {/* Filtros grandes y comprensibles */}
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
                Todo ({storeMovements.length})
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

          {/* Tabla / Libreta de apuntes */}
          <View style={styles.ledgerTable}>
            {/* Encabezado de la tabla */}
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableColHeader, styles.colDate]}>FECHA</Text>
              <Text style={[styles.tableColHeader, styles.colConcept]}>
                QUÉ FUE
              </Text>
              <Text style={[styles.tableColHeader, styles.colAmount]}>
                VALOR
              </Text>
            </View>

            {/* Filas de la tabla */}
            {filteredStoreMovements.length === 0 ? (
              <View style={styles.tableEmpty}>
                <Ionicons
                  name="receipt-outline"
                  size={32}
                  color={Colors.textMuted}
                />
                <Text style={styles.tableEmptyTitle}>Sin registros</Text>
                <Text style={styles.tableEmptyText}>
                  No hay movimientos para mostrar en este filtro.
                </Text>
              </View>
            ) : (
              filteredStoreMovements.map((item, index) => {
                const isCredit = item.kind === 'credit';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.tableRow,
                      index % 2 === 1 && styles.tableRowAlt,
                      index === filteredStoreMovements.length - 1 &&
                        styles.tableRowLast,
                    ]}>
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
                            {isCredit
                              ? 'Compra fiada (+)'
                              : 'Abono realizado (-)'}
                          </Text>
                        </View>
                      </View>

                      {item.dueDate ? (
                        <Text style={styles.rowDueDate}>
                          Pagar antes de: {formatDateDisplay(item.dueDate)}
                        </Text>
                      ) : null}
                    </View>

                    {/* Columna Monto */}
                    <View style={styles.colAmount}>
                      <Text
                        style={[
                          styles.rowAmountText,
                          isCredit
                            ? styles.rowAmountCredit
                            : styles.rowAmountPayment,
                        ]}>
                        {isCredit ? '+' : '−'}
                        {formatCOP(item.amount)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Resumen inferior de la libreta */}
            {storeMovements.length > 0 && (
              <View style={styles.tableSummary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Total fiado acumulado:
                  </Text>
                  <Text style={styles.summaryCreditValue}>
                    +{formatCOP(storeTotals.creditsSum)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    Total que has abonado:
                  </Text>
                  <Text style={styles.summaryPaymentValue}>
                    −{formatCOP(storeTotals.paymentsSum)}
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
            )}
          </View>

          {/* Botón inferior para volver */}
          <Button
            title="Volver a ver todas mis tiendas"
            variant="secondary"
            onPress={() => setSelectedStoreId(null)}
            style={styles.returnBtn}
          />
        </ScrollView>
      </View>
    );
  }

  // =========================================================================
  // VISTA 1: LISTADO DE TIENDAS VINCULADAS ("Mis Tiendas")
  // =========================================================================
  const allClear = totalBalance === 0 && stores.length > 0;

  return (
    <View style={styles.wrap}>
      {/* Cabecera amigable con saludo y botón de salir */}
      <View style={styles.header}>
        <View style={styles.flexOne}>
          <Text style={styles.headerGreeting}>¡Hola, {customerName}!</Text>
          <Text style={styles.headerSubtitle}>
            Tus cuentas en tiendas de barrio
          </Text>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <Ionicons
            name="log-out-outline"
            size={20}
            color={Colors.destructive}
          />
          <Text style={styles.logoutBtnText}>Salir</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        contentContainerStyle={styles.content}
        data={stores}
        keyExtractor={(item: any) => item.store_id}
        refreshing={isLoading}
        onRefresh={refetch}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Tarjeta del total */}
            <Card
              style={[styles.heroCard, allClear ? styles.heroCardClear : null]}>
              <View style={styles.heroTop}>
                <Ionicons
                  name={allClear ? 'checkmark-circle' : 'wallet'}
                  size={26}
                  color={allClear ? Colors.success : Colors.destructive}
                />
                <Text
                  style={[
                    styles.heroLabel,
                    allClear ? styles.heroLabelClear : null,
                  ]}>
                  {allClear
                    ? '¡ESTÁS AL DÍA EN TUS PAGOS!'
                    : 'TOTAL QUE DEBES EN TODAS TUS TIENDAS:'}
                </Text>
              </View>

              <Text
                style={[
                  styles.heroAmount,
                  allClear ? styles.heroAmountClear : null,
                ]}>
                {formatCOP(totalBalance)}
              </Text>

              <Text style={styles.heroHelpText}>
                {allClear
                  ? 'No tienes ninguna deuda pendiente. ¡Felicitaciones!'
                  : `Tienes cuenta en ${stores.length} tienda${
                      stores.length !== 1 ? 's' : ''
                    }. Toca cualquiera de tus tiendas abajo para ver tu libreta detallada.`}
              </Text>
            </Card>

            {/* Título de la sección de tiendas */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionMainTitle}>
                Tus tiendas ({stores.length})
              </Text>
              <Text style={styles.sectionSubtitle}>
                Toca la tienda que deseas revisar para ver sus compras y pagos:
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Ionicons
              name="storefront-outline"
              size={42}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyCardTitle}>
              No tienes tiendas vinculadas
            </Text>
            <Text style={styles.emptyCardText}>
              Pídele al tendero de tu barrio que te registre con tu número de
              documento para que puedas ver tus cuentas aquí.
            </Text>
          </Card>
        }
        renderItem={({item}: any) => {
          const rawStore: any = item.stores;
          const store: any = Array.isArray(rawStore) ? rawStore[0] : rawStore;
          const storeName = store?.store_name ?? 'Tienda de barrio';
          const balance = Number(item.current_balance || 0);
          const creditLimit = Number(item.credit_limit || 0);
          const paid = balance === 0;

          return (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => setSelectedStoreId(item.store_id)}
              style={styles.storeCardWrapper}>
              <Card style={styles.storeCard}>
                <View style={styles.storeCardRow}>
                  {/* Icono de la tienda */}
                  <View
                    style={[
                      styles.storeIconWrap,
                      paid ? styles.storeIconWrapPaid : null,
                    ]}>
                    <Ionicons
                      name="storefront"
                      size={24}
                      color={paid ? Colors.success : Colors.primary}
                    />
                  </View>

                  {/* Información de la tienda */}
                  <View style={styles.flexOne}>
                    <Text style={styles.storeCardName}>{storeName}</Text>
                    {store?.address ? (
                      <Text style={styles.storeCardMeta} numberOfLines={1}>
                        📍 {store.address}
                      </Text>
                    ) : null}
                    {creditLimit > 0 ? (
                      <Text style={styles.storeCardLimit}>
                        Tope de fiado: {formatCOP(creditLimit)}
                      </Text>
                    ) : null}
                  </View>

                  {/* Saldo de la tienda */}
                  <View style={styles.storeCardBalanceWrap}>
                    <Text
                      style={[
                        styles.storeCardBalanceLabel,
                        paid ? styles.balanceLabelPaid : null,
                      ]}>
                      {paid ? 'Al día' : 'Debes'}
                    </Text>
                    <Text
                      style={[
                        styles.storeCardBalance,
                        paid ? styles.storeCardBalancePaid : null,
                      ]}>
                      {formatCOP(balance)}
                    </Text>
                  </View>
                </View>

                {/* Botón visual para tocar y ver libreta */}
                <View style={styles.storeCardFooterPill}>
                  <Text style={styles.storeCardFooterText}>
                    Toca aquí para ver tus compras y abonos
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.primary}
                  />
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.listFooter}>
            <Button
              title="Cerrar sesión"
              variant="ghost"
              onPress={handleLogout}
              style={styles.footerLogoutBtn}
            />
          </View>
        }
      />
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
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  // Cabecera superior
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerGreeting: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.destructive,
  },

  // Contenido de la lista principal
  content: {
    padding: 18,
    gap: 14,
    paddingBottom: 36,
  },

  // Tarjeta Hero del Total
  heroCard: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    borderRadius: Radius.xl,
    padding: 20,
    gap: 6,
  },
  heroCardClear: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.destructive,
    letterSpacing: 0.8,
  },
  heroLabelClear: {
    color: '#15803D',
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.destructive,
    letterSpacing: -0.5,
  },
  heroAmountClear: {
    color: '#15803D',
  },
  heroHelpText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
    fontWeight: '500',
    marginTop: 2,
  },

  // Título de sección
  sectionHeader: {
    marginTop: 4,
    gap: 2,
  },
  sectionMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  // Tarjeta de cada tienda en la lista
  storeCardWrapper: {
    borderRadius: Radius.lg,
  },
  storeCard: {
    padding: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#1C1008',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  storeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  storeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeIconWrapPaid: {
    backgroundColor: '#DCFCE7',
  },
  storeCardName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  storeCardMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  storeCardLimit: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  storeCardBalanceWrap: {
    alignItems: 'flex-end',
  },
  storeCardBalanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.destructive,
  },
  balanceLabelPaid: {
    color: '#15803D',
  },
  storeCardBalance: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.destructive,
  },
  storeCardBalancePaid: {
    color: '#15803D',
  },
  storeCardFooterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  storeCardFooterText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Estado vacío
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  emptyCardText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  listFooter: {
    marginTop: 8,
    alignItems: 'center',
  },
  footerLogoutBtn: {
    paddingHorizontal: 20,
  },

  // =========================================================================
  // Estilos de la Vista 2 (Detalle de la Tienda / Libreta)
  // =========================================================================
  topNav: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF7ED',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  detailScroll: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  storeDetailCard: {
    padding: 18,
    gap: 14,
    borderRadius: Radius.xl,
  },
  storeDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  storeDetailAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeDetailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  callStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  callStoreBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  storeBalanceBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
  },
  storeBalanceBoxPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  storeBalanceLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.destructive,
    letterSpacing: 0.8,
  },
  storeBalanceLabelPaid: {
    color: '#15803D',
  },
  storeBalanceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.destructive,
    marginVertical: 4,
  },
  storeBalanceAmountPaid: {
    color: '#15803D',
  },
  storeBalanceHelp: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Filtros de la libreta
  filterBar: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Tabla estilo Libreta
  ledgerTable: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#FFF7ED',
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.border,
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

  // Filas
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  tableRowAlt: {
    backgroundColor: Colors.cardAlt,
  },
  tableRowLast: {
    borderBottomWidth: 0,
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
  rowDueDate: {
    fontSize: 10,
    color: Colors.destructive,
    fontWeight: '600',
    marginTop: 2,
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

  // Resumen inferior de la tabla
  tableSummary: {
    backgroundColor: Colors.cardAlt,
    borderTopWidth: 1.5,
    borderTopColor: Colors.border,
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
    backgroundColor: Colors.border,
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
  returnBtn: {
    marginTop: 8,
  },
});
