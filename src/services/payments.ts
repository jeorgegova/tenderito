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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("payments")
    .insert({
      customer_id: input.customer_id,
      credit_id: input.credit_id ?? null,
      amount: input.amount,
      notes: input.notes ?? null,
      merchant_id: user.id,
    })
    .select()
    .single();
  if (error) throw error;

  // Actualizar estado del crédito si aplica (best-effort)
  if (input.credit_id) {
    const { data: credit } = await supabase
      .from("credits")
      .select("amount")
      .eq("id", input.credit_id)
      .single();
    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("credit_id", input.credit_id);
    if (credit) {
      const paid = (payments ?? []).reduce(
        (a: number, p: { amount: number }) => a + Number(p.amount),
        0
      );
      const total = Number((credit as { amount: number }).amount);
      const status =
        paid >= total ? "paid" : paid > 0 ? "partially_paid" : "pending";
      await supabase
        .from("credits")
        .update({ status })
        .eq("id", input.credit_id);
    }
  }

  return data as Payment;
}
