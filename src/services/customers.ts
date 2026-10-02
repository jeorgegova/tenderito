import { supabase } from "../lib/supabase";
import type { Customer, NewCustomerInput } from "../types";
import { PLAN_LIMITS, type SubscriptionPlan } from "../theme";

// Lista clientes del comerciante, con búsqueda opcional
export async function fetchCustomers(search?: string): Promise<Customer[]> {
  let query = supabase
    .from("customers")
    .select("*")
    .order("current_balance", { ascending: false });

  if (search?.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data as Customer[];
}

export async function fetchCustomerById(id: string): Promise<Customer> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Customer;
}

// Valida límite por plan antes de insertar.
// Retorna { allowed: false } si excede Free (10) o Basic (100).
export async function canCreateCustomer(
  plan: SubscriptionPlan
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const { count, error } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  const limit = PLAN_LIMITS[plan];
  return { allowed: (count ?? 0) < limit, count: count ?? 0, limit };
}

export async function createCustomer(input: NewCustomerInput): Promise<Customer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...input, merchant_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Customer;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}
