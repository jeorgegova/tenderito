import {useQuery, useQueryClient} from '@tanstack/react-query';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

export function FreePortfolioScreen({navigation}: any) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['free-portfolio'],
    queryFn: fetchFreePortfolioStatus,
  });

  const customersQuery = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const status = statusQuery.data;
  const pending = Boolean(status?.selection_pending);
  const limit = Number(status?.limit ?? 10);

  const activeCustomers = useMemo(
    () =>
      (customersQuery.data ?? [])
        .filter(customer => Number(customer.current_balance) > 0)
        .sort((a, b) => Number(b.current_balance) - Number(a.current_balance)),
    [customersQuery.data],
  );

  useEffect(() => {
    if (!pending) {
      return;
    }

    // Al bajar a Free la selección se hace desde cero. No reutilizamos
    // marcas locales antiguas para evitar arrastrar una selección previa.
    setSelectedIds([]);
  }, [pending]);

  function toggleCustomer(customerId: string) {
    if (!pending || saving) {
      return;
    }

    setSelectedIds(current => {
      if (current.includes(customerId)) {
        return current.filter(id => id !== customerId);
      }

      if (current.length >= limit) {
        showAlert(
          'Cupos completos',
          `Tu plan Free permite ${limit} clientes con cartera activa. Quita uno para elegir otro.`,
        );
        return current;
      }

      return [...current, customerId];
    });
  }

  async function saveSelection() {
    if (!pending || saving) {
      return;
    }

    if (selectedIds.length === 0) {
      showAlert(
        'Selecciona tu cartera',
        'Elige al menos un cliente para continuar manejando su cartera.',
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
          'Los clientes seleccionados conservarán su cartera activa. Los demás solo podrán recibir abonos.',
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

  return (
    <View style={styles.wrap}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryIcon}>
              <Ionicons name="people" size={22} color={Colors.primary} />
            </View>
            <View style={{flex: 1}}>
              <Text style={styles.summaryTitle}>
                {pending
                  ? 'Elige tu cartera Free'
                  : 'Cartera activa del plan Free'}
              </Text>
              <Text style={styles.summarySubtitle}>
                {status?.portfolio_enforced
                  ? `${status.portfolio_count} de ${limit} cupos con cartera activa`
                  : `Tu plan actual permite ${limit} clientes con cartera activa`}
              </Text>
            </View>
            {status?.portfolio_enforced ? (
              <Text style={styles.counter}>
                {status.portfolio_count}/{limit}
              </Text>
            ) : null}
          </View>

          <Text style={styles.explanation}>
            {pending
              ? `Tienes ${
                  status?.active_count ?? 0
                } clientes con saldo pendiente. Tu plan Free permite ${limit} con cartera activa. Elige hasta ${limit}: solo ellos podrán recibir nuevos fiados. Los demás conservan su deuda y solo podrán recibir abonos. Esta selección se hace una sola vez.`
              : 'Solo los clientes seleccionados pueden recibir nuevos fiados. Los clientes fuera de cartera solo reciben abonos. Cuando un cliente de la cartera queda en $0, su cupo se libera automáticamente para otro cliente.'}
          </Text>
        </Card>

        {status?.portfolio_enforced && !pending ? (
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={Colors.primary}
              />
              <Text style={styles.infoText}>
                Cupos libres ahora: {status.remaining_slots}. Para usar un cupo,
                dale un nuevo fiado a un cliente que esté en $0.
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Clientes con saldo pendiente ({activeCustomers.length})
          </Text>
          <Text style={styles.sectionHint}>
            {pending
              ? `Seleccionados: ${selectedIds.length}/${limit}`
              : 'Los que no están en cartera solo reciben abonos'}
          </Text>
        </View>

        {activeCustomers.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Ionicons
              name="checkmark-circle-outline"
              size={26}
              color={Colors.primary}
            />
            <Text style={styles.emptyTitle}>Sin cartera activa</Text>
            <Text style={styles.emptyText}>
              Todos tus clientes están en $0. Puedes dar nuevos fiados hasta
              completar los {limit} cupos del plan Free.
            </Text>
          </Card>
        ) : (
          activeCustomers.map(customer => {
            const isSelected = pending
              ? selectedIds.includes(customer.id)
              : Boolean(customer.free_plan_selected);

            return (
              <Pressable
                key={customer.id}
                onPress={() => toggleCustomer(customer.id)}
                disabled={!pending}
                style={({pressed}) => [
                  styles.customerRow,
                  isSelected ? styles.customerRowSelected : null,
                  pressed && pending ? {opacity: 0.8} : null,
                ]}>
                <View
                  style={[
                    styles.checkbox,
                    isSelected ? styles.checkboxSelected : null,
                  ]}>
                  {isSelected ? (
                    <Ionicons name="checkmark" size={15} color="#fff" />
                  ) : null}
                </View>

                <View style={{flex: 1}}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {customer.alias?.trim() ? customer.alias : customer.name}
                  </Text>
                  <Text style={styles.customerMeta} numberOfLines={1}>
                    {pending
                      ? isSelected
                        ? 'Seleccionado'
                        : 'Fuera de cartera'
                      : isSelected
                      ? 'Cartera activa'
                      : 'Solo abonos'}{' '}
                    · Debe {formatCOP(Number(customer.current_balance))}
                  </Text>
                </View>

                {!pending && !customer.free_plan_selected ? (
                  <View style={styles.blockedPill}>
                    <Text style={styles.blockedPillText}>Solo abonos</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}

        {pending ? (
          <Button
            title={
              saving
                ? 'Guardando…'
                : `Confirmar cartera (${selectedIds.length}/${limit})`
            }
            icon="check"
            onPress={saveSelection}
            disabled={saving || selectedIds.length === 0}
          />
        ) : (
          <Button
            title="Volver"
            variant="secondary"
            onPress={() => navigation.goBack()}
          />
        )}
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
  infoCard: {padding: 12},
  infoRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 8},
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textSecondary,
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
  emptyCard: {alignItems: 'center', padding: 20, gap: 6},
  emptyTitle: {fontSize: 15, fontWeight: '800', color: Colors.text},
  emptyText: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
