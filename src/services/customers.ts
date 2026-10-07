import { supabase } from "../lib/supabase";
import type { Customer, NewCustomerInput } from "../types";
import { PLAN_LIMITS, type SubscriptionPlan } from "../theme";

// Lista clientes del comerciante, con búsqueda opcional
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  let query = supabase
    .from("customer_stores")
    .select("current_balance, customers!inner(*)")
    .order("current_balance", { ascending: false });

  if (search?.trim()) {
    query = query.ilike("customers.name", `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row.customers,
    current_balance: Number(row.current_balance),
  })) as Customer[];
}

export async function fetchCustomerById(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from("customer_stores")
    .select("current_balance, customers!inner(*)")
    .eq("customer_id", id)
    .single();
  if (error) throw error;
  return {...(data as any).customers, current_balance: Number((data as any).current_balance)} as Customer;
}

// Valida límite por plan antes de insertar.
// Retorna { allowed: false } si excede Free (10) o Basic (100).
export async function canCreateCustomer(
  plan: SubscriptionPlan
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const { count, error } = await supabase
    .from("customer_stores")
    .select("customer_id", { count: "exact", head: true });
  if (error) throw error;
  const limit = PLAN_LIMITS[plan];
  return { allowed: (count ?? 0) < limit, count: count ?? 0, limit };
}

export async function createCustomer(input: NewCustomerInput): Promise<Customer> {
  const { data, error } = await supabase.rpc("create_customer", {
    p_name: input.name,
    p_document_type: input.document_type,
    p_document_number: input.document_number,
    p_phone: input.phone ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  // Desvincula solo esta tienda; el cliente global puede seguir en otras.
  const { error } = await supabase
    .from('customer_stores')
    .delete()
    .eq('customer_id', id);
  if (error) throw error;
}
