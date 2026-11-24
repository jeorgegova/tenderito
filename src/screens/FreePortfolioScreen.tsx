import {useQuery, useQueryClient} from '@tanstack/react-query';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Button} from '../components/ui/Button';
import {Card} from '../components/ui/Card';
import {showAlert} from '../components/ui/AlertModal';
import {fetchCustomers} from '../services/customers';
import {
  fetchFreePortfolioStatus,
  setFreePortfolioSelection,
} from '../services/portfolio';
import {Colors, Radius, formatCOP} from '../theme';
import {useResponsive} from '../hooks/useResponsive';

export function FreePortfolioScreen({navigation}: any) {
  const {tabletContainerStyle} = useResponsive();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  const statusQuery = useQuery({
    queryKey: ['free-portfolio'],
    queryFn: fetchFreePortfolioStatus,
  });

  const customersQuery = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const status = statusQuery.data;
  const limit = Number(status?.limit ?? 10);
  const isUnlimited = limit >= 999999 || Boolean(status?.is_unlimited);

  const activeCustomers = useMemo(
    () =>
      (customersQuery.data ?? [])
        .filter(customer => Number(customer.current_balance) > 0)
        .sort((a, b) => Number(b.current_balance) - Number(a.current_balance)),
    [customersQuery.data],
  );

  useEffect(() => {
    if (hasInitialized || !customersQuery.data) {
      return;
    }

    const initialSelected = (customersQuery.data || [])
      .filter(
        c =>
          Number(c.current_balance) > 0 &&
          (c.free_plan_selected === true || (c as any).free_plan_selected === 1),
      )
      .map(c => c.id);

    if (initialSelected.length > 0) {
      setSelectedIds(initialSelected);
    } else if (activeCustomers.length > 0 && !isUnlimited) {
      // Si ninguno estaba marcado, pre-seleccionar hasta el cupo del plan
      setSelectedIds(activeCustomers.slice(0, limit).map(c => c.id));
    }
    setHasInitialized(true);
  }, [customersQuery.data, activeCustomers, limit, isUnlimited, hasInitialized]);

  function toggleCustomer(customerId: string) {
    if (saving || isUnlimited) {
      return;
    }

    setSelectedIds(current => {
      if (current.includes(customerId)) {
        return current.filter(id => id !== customerId);
      }

      if (current.length >= limit) {
        showAlert(
          'Cupos completos',
          `Tu suscripción permite hasta ${limit} clientes con cartera activa. Deselecciona uno para poder elegir otro.`,
        );
        return current;
      }

      return [...current, customerId];
    });
  }

  async function saveSelection() {
    if (saving || isUnlimited) {
      return;
    }

    if (selectedIds.length === 0 && activeCustomers.length > 0) {
      showAlert(
        'Selecciona tu cartera',
        'Elige al menos un cliente para continuar manejando su cartera activa.',
      );
      return;
    }

    try {
      setSaving(true);
      await setFreePortfolioSelection(selectedIds);
      await queryClient.invalidateQueries({queryKey: ['free-portfolio']});
      await queryClient.invalidateQueries({queryKey: ['customers-all']});
      await queryClient.invalidateQueries({queryKey: ['customers']});
      await queryClient.invalidateQueries({queryKey: ['customer']});

      showAlert({
        title: 'Cartera actualizada',
        message:
          'Los clientes seleccionados conservarán su cartera activa. Los clientes no seleccionados solo podrán recibir abonos.',
        type: 'success',
      });
    } catch (error: any) {
      showAlert('No se pudo guardar', error?.message ?? 'Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  if (statusQuery.isLoading || customersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Cargando cartera…</Text>
      </View>
    );
  }

  const remainingSlots = isUnlimited ? 999999 : Math.max(0, limit - selectedIds.length);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, tabletContainerStyle(640)]}
        showsVerticalScrollIndicator={false}>
        {isUnlimited ? (
          <Card style={[styles.summaryCard, {backgroundColor: '#DCFCE7', borderColor: '#86EFAC'}]}>
            <View style={styles.summaryRow}>
              <View style={[styles.summaryIcon, {backgroundColor: '#BBF7D0'}]}>
                <Ionicons name="checkmark-circle" size={24} color="#15803D" />
              </View>
              <View style={{flex: 1}}>
                <Text style={[styles.summaryTitle, {color: '#15803D'}]}>
                  Cartera Ilimitada
                </Text>
                <Text style={[styles.summarySubtitle, {color: '#166534'}]}>
                  Sin límite de clientes con saldo activo
                </Text>
              </View>
            </View>
            <Text style={[styles.explanation, {color: '#166534'}]}>
              Tu plan actual no tiene límite de clientes con cartera activa. Todos tus clientes pueden recibir nuevos fiados y abonos con total normalidad.
            </Text>
          </Card>
        ) : (
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryIcon}>
                <Ionicons name="people" size={22} color={Colors.primary} />
              </View>
              <View style={{flex: 1}}>
                <Text style={styles.summaryTitle}>
                  Cartera activa del plan
                </Text>
                <Text style={styles.summarySubtitle}>
                  Límite de suscripción: {limit} clientes con saldo &gt; $0
                </Text>
              </View>
              <Text style={styles.counter}>
                {selectedIds.length}/{limit}
              </Text>
            </View>

            <Text style={styles.explanation}>
              Solo los clientes seleccionados pueden recibir nuevos fiados. Los clientes no seleccionados conservan su deuda pero solo reciben abonos. Cuando un cliente termina de pagar y su saldo llega a $0, se libera un cupo automáticamente.
            </Text>

            <View style={styles.slotsRow}>
              <Text style={styles.slotsText}>
                Cupos en uso: <Text style={{color: Colors.primary, fontWeight: '800'}}>{selectedIds.length} / {limit}</Text>
              </Text>
              <Text style={styles.slotsText}>
                Disponibles: <Text style={{color: remainingSlots > 0 ? '#15803D' : Colors.destructive, fontWeight: '800'}}>{remainingSlots}</Text>
              </Text>
            </View>
          </Card>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Clientes con saldo pendiente ({activeCustomers.length})
          </Text>
          {!isUnlimited && (
            <Text style={styles.sectionHint}>
              Seleccionados: {selectedIds.length} de {limit} permitidos
            </Text>
          )}
        </View>

        {activeCustomers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={32}
              color={Colors.primary}
            />
            <Text style={styles.emptyTitle}>Sin cartera activa</Text>
            <Text style={styles.emptyText}>
              Todos tus clientes están en $0. Puedes dar nuevos fiados a cualquier cliente hasta completar los cupos de tu suscripción.
            </Text>
          </Card>
        ) : (
          activeCustomers.map(customer => {
            const isSelected = isUnlimited || selectedIds.includes(customer.id);

            return (
              <Pressable
                key={customer.id}
                onPress={() => !isUnlimited && toggleCustomer(customer.id)}
                disabled={isUnlimited}
                style={({pressed}) => [
                  styles.customerRow,
                  isSelected ? styles.customerRowSelected : null,
                  pressed && !isUnlimited ? {opacity: 0.8} : null,
                ]}>
                {!isUnlimited && (
                  <View
                    style={[
                      styles.checkbox,
                      isSelected ? styles.checkboxSelected : null,
                    ]}>
                    {isSelected ? (
                      <Ionicons name="checkmark" size={15} color="#fff" />
                    ) : null}
                  </View>
                )}

                <View style={{flex: 1}}>
                  <Text style={styles.customerName} numberOfLines={2}>
                    {customer.alias?.trim() ? customer.alias : customer.name}
                  </Text>
                  <Text style={styles.customerMeta} numberOfLines={2}>
                    {isSelected ? 'Cartera activa' : 'Solo abonos'} · Debe {formatCOP(Number(customer.current_balance))}
                  </Text>
                </View>

                {!isSelected ? (
                  <View style={styles.blockedPill}>
                    <Text style={styles.blockedPillText}>Solo abonos</Text>
                  </View>
                ) : (
                  <View style={styles.activePill}>
                    <Text style={styles.activePillText}>Activo</Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}

        {!isUnlimited && activeCustomers.length > 0 && (
          <Button
            title={
              saving
                ? 'Guardando…'
                : `Guardar cartera (${selectedIds.length}/${limit})`
            }
            icon="check"
            onPress={saveSelection}
            disabled={saving}
          />
        )}

        <Button
          title="Volver"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: Colors.background},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: 10,
  },
  loadingText: {color: Colors.textSecondary, fontSize: 13},
  content: {padding: 20, paddingBottom: 36, gap: 12},
  summaryCard: {gap: 12, padding: 16},
  summaryRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {fontSize: 17, fontWeight: '800', color: Colors.text},
  summarySubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  counter: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.primary,
  },
  explanation: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  slotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  slotsText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionHeader: {marginTop: 6, gap: 2},
  sectionTitle: {fontSize: 15, fontWeight: '800', color: Colors.text},
  sectionHint: {fontSize: 12, color: Colors.textSecondary},
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#fff',
  },
  customerRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  customerName: {fontSize: 14, fontWeight: '700', color: Colors.text},
  customerMeta: {fontSize: 12, color: Colors.textSecondary, marginTop: 2},
  blockedPill: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  blockedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.destructive,
  },
  activePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803D',
  },
  emptyCard: {alignItems: 'center', padding: 20, gap: 6},
  emptyTitle: {fontSize: 15, fontWeight: '800', color: Colors.text},
  emptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
