import {useQuery} from '@tanstack/react-query';
import {useEffect, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {DatePicker} from '../components/ui/DatePicker';
import {DynamicBrandCurves} from '../components/ui/DynamicBrandCurves';
import {Input} from '../components/ui/Input';
import {showAlert} from '../components/ui/AlertModal';
import {CreateCustomerModal} from '../components/CreateCustomerModal';
import {createCredit} from '../services/credits';
import {fetchCustomers} from '../services/customers';
import {canCreateCreditForCustomer} from '../services/portfolio';
import {useStore} from '../store/useStore';
import {Colors, Radius, formatCOP} from '../theme';
import {FormatMoney, parseMoney, getBogotaTodayYMD} from '../utils/format';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useMutationWithSync} from '../hooks/useMutationWithSync';
import {useResponsive} from '../hooks/useResponsive';
import type {CreditEligibility} from '../types';

const QUICK_CONCEPTS = [
  'Mercado semanal',
  'Abarrotes',
  'Lácteos y pan',
  'Bebidas y mecato',
  'Carnes y verduras',
  'Aseo para el hogar',
];

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];

export function NewCreditScreen({route, navigation}: any) {
  const {isSmall, isTablet, tabletContainerStyle} = useResponsive();
  const initialId = route.params?.customerId as string | undefined;
  const [customer_id, setCustomerId] = useState(initialId ?? '');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [eligibility, setEligibility] = useState<CreditEligibility | null>(null);
  const insets = useSafeAreaInsets();
  const profile = useStore(s => s.profile);

  const {data: customers} = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => fetchCustomers(),
  });

  const selectedCustomer = customers?.find(c => c.id === customer_id);
  const numericAmount = parseMoney(amount);
  const currentBalance = Number(selectedCustomer?.current_balance ?? 0);
  const creditLimit = Number(selectedCustomer?.credit_limit ?? 0);
  const newBalance = currentBalance + numericAmount;
  const exceedsLimit =
    creditLimit > 0 && numericAmount > 0 && newBalance > creditLimit;
  const creditBlocked = Boolean(eligibility && !eligibility.allowed);

  useEffect(() => {
    let cancelled = false;

    if (!customer_id) {
      setEligibility(null);
      return;
    }

    canCreateCreditForCustomer(customer_id, profile).then(result => {
      if (!cancelled) {
        setEligibility(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [customer_id, profile, customers]);

  const matchingCustomers = (customers ?? []).filter(c =>
    `${c.alias ?? ''} ${c.name} ${c.document_number ?? ''}`
      .toLocaleLowerCase('es-CO')
      .includes(customerSearch.toLocaleLowerCase('es-CO')),
  );

  const mutation = useMutationWithSync(createCredit, {
    onSuccess: () => navigation.goBack(),
    onError: (error: any) =>
      showAlert({
        title: 'No se pudo registrar',
        message: error?.message ?? 'Intenta de nuevo',
        type: 'destructive',
      }),
  });

  const addAmount = (val: number) => {
    const current = parseMoney(amount);
    setAmount(FormatMoney(String(current + val)));
  };

  async function onSave() {
    if (!customer_id) {
      return showAlert({
        title: 'Faltan datos',
        message: 'Elige un cliente para el fiado',
        type: 'warning',
      });
    }
    if (!concept.trim() || !parseMoney(amount)) {
      return showAlert({
        title: 'Faltan datos',
        message: 'Ingresa un concepto y un monto válido',
        type: 'warning',
      });
    }

    const check = await canCreateCreditForCustomer(customer_id, profile);
    if (!check.allowed) {
      return showAlert({
        title: 'No puedes crear este fiado',
        message: check.message ?? 'Tu plan actual no lo permite.',
        type: 'warning',
      });
    }

    mutation.mutate({
      customer_id,
      concept: concept.trim(),
      amount: parseMoney(amount),
      due_date: dueDate.trim() || null,
    });
  }

  return (
    <View style={styles.sheet}>
      <DynamicBrandCurves position="top-right" />
      <ScrollView
        contentContainerStyle={[styles.content, tabletContainerStyle(560)]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* ── SELECCIÓN O BÚSQUEDA DEL CLIENTE ── */}
        {selectedCustomer ? (
          <Card style={styles.selectedCard}>
            <View style={styles.customerHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(selectedCustomer.alias || selectedCustomer.name)
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {selectedCustomer.alias && selectedCustomer.alias.trim()
                    ? selectedCustomer.alias
                    : selectedCustomer.name}
                </Text>
                {selectedCustomer.alias && selectedCustomer.alias.trim() ? (
                  <Text style={styles.customerRealName} numberOfLines={1}>
                    {selectedCustomer.name}
                  </Text>
                ) : null}
                <Text style={styles.customerDoc} numberOfLines={1}>
                  {selectedCustomer.document_number
                    ? `C.C. ${selectedCustomer.document_number}`
                    : selectedCustomer.phone
                    ? `📞 ${selectedCustomer.phone}`
                    : 'Cliente frecuente'}
                </Text>
              </View>
              {!initialId ? (
                <Pressable
                  onPress={() => setCustomerId('')}
                  hitSlop={12}
                  style={styles.changeBtn}>
                  <Ionicons name="swap-horizontal" size={14} color={Colors.primary} />
                  <Text style={styles.changeText}>Cambiar</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.customerDivider} />

            {/* Fila de métricas financieras */}
            <View style={styles.balanceSummaryRow}>
              <View style={styles.balanceSummaryCol}>
                <Text style={styles.balanceSummaryLabel}>DEUDA ACTUAL</Text>
                <Text
                  style={[
                    styles.balanceSummaryVal,
                    currentBalance > 0 && {color: Colors.destructive},
                  ]}
                  numberOfLines={1}>
                  {formatCOP(currentBalance)}
                </Text>
              </View>
              <View style={styles.balanceSummarySeparator} />
              <View style={styles.balanceSummaryCol}>
                <Text style={styles.balanceSummaryLabel}>TOPE MÁXIMO</Text>
                <Text style={styles.balanceSummaryVal} numberOfLines={1}>
                  {creditLimit > 0 ? formatCOP(creditLimit) : 'Sin tope'}
                </Text>
              </View>
              {creditLimit > 0 ? (
                <>
                  <View style={styles.balanceSummarySeparator} />
                  <View style={styles.balanceSummaryCol}>
                    <Text style={styles.balanceSummaryLabel}>CUPO LIBRE</Text>
                    <Text
                      style={[
                        styles.balanceSummaryVal,
                        {
                          color:
                            creditLimit - currentBalance > 0
                              ? Colors.success
                              : Colors.destructive,
                        },
                      ]}
                      numberOfLines={1}>
                      {formatCOP(Math.max(0, creditLimit - currentBalance))}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </Card>
        ) : (
          <Card style={styles.pickerCard}>
            <View style={styles.pickerHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.pickerTitle}>¿A quién le vas a fiar?</Text>
                <Text style={styles.pickerSubtitle}>
                  Busca el cliente o crea uno nuevo
                </Text>
              </View>
              <Pressable
                onPress={() => setShowNewCustomerModal(true)}
                style={styles.newCustomerBtn}
                hitSlop={8}>
                <Ionicons
                  name="person-add"
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.newCustomerBtnText}>Nuevo</Text>
              </Pressable>
            </View>

            <Input
              leadingIcon="search-outline"
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Escribe nombre, alias o cédula..."
              trailingIcon={customerSearch ? 'close-circle' : undefined}
              onTrailingPress={() => setCustomerSearch('')}
            />

            <ScrollView
              style={styles.optionsList}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled">
              {matchingCustomers.map(customer => {
                const hasAlias = Boolean(
                  customer.alias && customer.alias.trim(),
                );
                const custBal = Number(customer.current_balance || 0);
                return (
                  <Pressable
                    key={customer.id}
                    onPress={() => {
                      setCustomerId(customer.id);
                      setCustomerSearch('');
                    }}
                    style={({pressed}) => [
                      styles.optionItem,
                      pressed && styles.optionItemPressed,
                    ]}>
                    <View style={styles.optionAvatar}>
                      <Text style={styles.avatarText}>
                        {(customer.alias || customer.name)
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.flex1}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {hasAlias ? customer.alias : customer.name}
                      </Text>
                      {hasAlias ? (
                        <Text style={styles.customerRealName} numberOfLines={1}>
                          {customer.name}
                        </Text>
                      ) : null}
                      <Text style={styles.muted} numberOfLines={1}>
                        {customer.document_number
                          ? `C.C. ${customer.document_number} · `
                          : ''}
                        {customer.phone ? `📞 ${customer.phone}` : ''}
                      </Text>
                    </View>
                    <View style={styles.optionRight}>
                      <Text
                        style={[
                          styles.optionDebt,
                          custBal > 0 && {color: Colors.destructive},
                        ]}>
                        {custBal > 0 ? `Debe ${formatCOP(custBal)}` : 'Al día'}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={Colors.textMuted}
                      />
                    </View>
                  </Pressable>
                );
              })}
              {matchingCustomers.length === 0 ? (
                <View style={styles.emptyOptionsWrap}>
                  <Ionicons name="search-outline" size={26} color={Colors.textMuted} />
                  <Text style={styles.emptyOptionsText}>
                    No encontramos clientes con "{customerSearch}".
                  </Text>
                  <Pressable
                    onPress={() => setShowNewCustomerModal(true)}
                    style={styles.emptyCreateBtn}>
                    <Ionicons name="person-add-outline" size={14} color={Colors.primary} />
                    <Text style={styles.emptyCreateBtnText}>Crear cliente ahora</Text>
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </Card>
        )}

        {/* ── ALERTA DE BLOQUEO POR PLAN ── */}
        {creditBlocked ? (
          <View style={styles.limitAlertBox}>
            <Ionicons
              name="lock-closed"
              size={18}
              color={Colors.destructive}
            />
            <View style={styles.flex1}>
              <Text style={styles.limitAlertTitle}>
                Solo abonos para este cliente
              </Text>
              <Text style={styles.limitAlertDesc}>{eligibility?.message}</Text>
            </View>
          </View>
        ) : null}

        {/* ── DETALLE DEL FIADO (FORMULARIO PRINCIPAL) ── */}
        <Card style={styles.formCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionIconCircle}>
              <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Detalles de la compra</Text>
          </View>

          {/* Input Concepto con atajos rápidos */}
          <View style={styles.fieldBlock}>
            <Input
              label="¿Qué se llevó? (Concepto)"
              leadingIcon="basket-outline"
              value={concept}
              onChangeText={setConcept}
              placeholder="Ej. Mercado de la semana, gaseosas..."
              trailingIcon={concept ? 'close-circle' : undefined}
              onTrailingPress={() => setConcept('')}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {QUICK_CONCEPTS.map(item => (
                <Pressable
                  key={item}
                  onPress={() => setConcept(item)}
                  style={[styles.chip, concept === item && styles.chipActive]}>
                  <Text
                    style={[
                      styles.chipText,
                      concept === item && styles.chipTextActive,
                    ]}>
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Input Valor con atajos de suma rápida */}
          <View style={styles.fieldBlock}>
            <Input
              label="Valor del fiado"
              leadingIcon="cash-outline"
              value={amount ? FormatMoney(amount) : ''}
              onChangeText={value => setAmount(FormatMoney(value))}
              keyboardType="numeric"
              placeholder="$ 0"
              trailingIcon={amount ? 'close-circle' : undefined}
              onTrailingPress={() => setAmount('')}
              error={
                exceedsLimit
                  ? `Supera el tope de crédito (${formatCOP(creditLimit)})`
                  : undefined
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}>
              {QUICK_AMOUNTS.map(val => (
                <Pressable
                  key={val}
                  onPress={() => addAmount(val)}
                  style={styles.amountChip}>
                  <Text style={styles.amountChipText}>+{formatCOP(val)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Previsualización en tiempo real del saldo */}
          {numericAmount > 0 ? (
            exceedsLimit ? (
              <View style={styles.limitAlertBox}>
                <Ionicons
                  name="alert-circle"
                  size={20}
                  color={Colors.destructive}
                />
                <View style={styles.flex1}>
                  <Text style={styles.limitAlertTitle}>
                    Supera valor del tope
                  </Text>
                  <Text style={styles.limitAlertDesc}>
                    El tope asignado es {formatCOP(creditLimit)} y el nuevo saldo
                    quedaría en {formatCOP(newBalance)} (exceso de{' '}
                    {formatCOP(newBalance - creditLimit)}).
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.previewBox}>
                <View style={styles.previewIconCircle}>
                  <Ionicons
                    name="trending-up"
                    size={18}
                    color={Colors.primary}
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.previewLabel}>CÓMO QUEDARÁ SU CUENTA</Text>
                  <Text style={styles.previewValue}>
                    Debe {formatCOP(currentBalance)} + Fiado {formatCOP(numericAmount)} ={' '}
                    <Text style={styles.previewBold}>{formatCOP(newBalance)}</Text>
                  </Text>
                </View>
              </View>
            )
          ) : null}

          {/* Fecha para pagar */}
          <DatePicker
            label="¿Cuándo acordaron pagar? (Opcional)"
            value={dueDate}
            onChange={date => setDueDate(date ?? '')}
            placeholder="Toca para elegir fecha límite"
            minDate={getBogotaTodayYMD()}
            helperText="Define el día en que acuerdas con el cliente que cancelará la cuenta."
          />
        </Card>
      </ScrollView>

      {/* ── BOTONES INFERIORES FIJOS ── */}
      <View
        style={[
          styles.footer,
          {paddingBottom: Math.max(insets.bottom, 12) + 8},
        ]}>
        <Button
          title={mutation.isPending ? 'Guardando…' : 'Guardar fiado'}
          icon="check"
          onPress={onSave}
          disabled={mutation.isPending || creditBlocked || !numericAmount || !customer_id}
        />
        <Button
          title="Cancelar"
          variant="ghost"
          onPress={() => navigation.goBack()}
        />
      </View>

      <CreateCustomerModal
        visible={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        existingCustomers={customers}
        onCustomerCreated={newCust => {
          setCustomerId(newCust.id);
          setCustomerSearch('');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: Colors.background, position: 'relative'},
  content: {paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, gap: 14},
  footer: {
    padding: 16,
    paddingBottom: 26,
    gap: 8,
    backgroundColor: Colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    shadowColor: '#142033',
    shadowOffset: {width: 0, height: -3},
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  flex1: {flex: 1},

  // ── Tarjeta de Cliente Seleccionado ──
  selectedCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  avatarText: {color: Colors.primary, fontWeight: '800', fontSize: 17},
  customerName: {fontSize: 16, fontWeight: '800', color: Colors.text},
  customerRealName: {fontSize: 12, color: Colors.textSecondary, marginTop: 1},
  customerDoc: {fontSize: 12, color: Colors.textMuted, marginTop: 2},
  muted: {fontSize: 12, color: Colors.textMuted, marginTop: 2},
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  changeText: {color: Colors.primaryDark, fontSize: 12, fontWeight: '800'},
  customerDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  balanceSummaryCol: {
    flex: 1,
    alignItems: 'center',
  },
  balanceSummarySeparator: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  balanceSummaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.6,
  },
  balanceSummaryVal: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },

  // ── Buscador de clientes ──
  pickerCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  pickerSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  newCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  newCustomerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  optionsList: {
    maxHeight: 220,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  optionItemPressed: {
    backgroundColor: '#F1F5F9',
  },
  optionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  optionRight: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 4,
  },
  optionDebt: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  emptyOptionsWrap: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyOptionsText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primaryMid,
  },
  emptyCreateBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },

  // ── Formulario Principal ──
  formCard: {
    padding: 16,
    borderRadius: 20,
    gap: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: -4,
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  fieldBlock: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primaryMid,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  amountChip: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  amountChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primaryDark,
  },

  // ── Previsualización de Saldo ──
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  previewValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  previewBold: {
    color: Colors.primaryDark,
    fontWeight: '800',
    fontSize: 14,
  },

  // ── Alertas ──
  limitAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  limitAlertTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.destructive,
  },
  limitAlertDesc: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
    lineHeight: 16,
  },
});
