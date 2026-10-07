import { supabase } from "../lib/supabase";
import type { Credit, NewCreditInput } from "../types";

export async function fetchCreditsByCustomer(
  customerId: string
): Promise<Credit[]> {
  const { data, error } = await supabase
    .from("credits")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Credit[];
}

// Créditos vencidos (due_date < hoy y no pagados) para alertas rojas
export async function fetchOverdueCredits(): Promise<Credit[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("credits")
    .select("*, customers(id, name, phone)")
    .neq("status", "paid")
    .lt("due_date", today)
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data as Credit[];
}

// Total cuentas por cobrar = suma de balances de clientes
export async function fetchTotalReceivable(): Promise<number> {
  const { data, error } = await supabase
    .from("customer_stores")
    .select("current_balance");
  if (error) throw error;
  return (data ?? []).reduce(
    (acc: number, c: { current_balance: number }) =>
      acc + Number(c.current_balance),
    0
  );
}

export async function createCredit(input: NewCreditInput): Promise<Credit> {
  const { data, error } = await supabase.rpc("create_credit", {
    p_customer_id: input.customer_id,
    p_concept: input.concept,
    p_amount: input.amount,
    p_due_date: input.due_date ?? null,
  });
  if (error) throw error;
  return data as Credit;
}

export async function markCreditPaid(id: string): Promise<void> {
  const { error } = await supabase
    .from("credits")
    .update({ status: "paid" })
    .eq("id", id);
  if (error) throw error;
}
