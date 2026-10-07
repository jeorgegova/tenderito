import { supabase } from "../lib/supabase";
import type { NewPaymentInput, Payment } from "../types";

export async function fetchPaymentsByCustomer(
  customerId: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("customer_id", customerId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data as Payment[];
}

// Abono: puede ser global (credit_id null) o asociado a un crédito.
// Si el pago cubre el crédito, marca el crédito como paid/partially_paid.
export async function createPayment(input: NewPaymentInput): Promise<Payment> {
  const { data, error } = await supabase.rpc("create_payment", {
    p_customer_id: input.customer_id,
    p_credit_id: input.credit_id ?? null,
    p_amount: input.amount,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as Payment;
}
