// Interfaces TypeScript basadas en esquema Supabase Tenderito

export type SubscriptionPlan = 'free' | 'basic' | 'pro';
export type CreditStatus = 'pending' | 'partially_paid' | 'paid';
export type EstadoServidor =
  | 'pendiente'
  | 'sincronizado'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'error';

export interface Profile {
  id: string;
  store_name: string;
  merchant_name: string;
  phone: string | null;
  subscription_plan: SubscriptionPlan | string;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  subscription_status?: string | null;
  created_at: string;
}

export interface SubscriptionPlanItem {
  id: string;
  name: string;
  description: string;
  price: number;
  price_text: string;
  customer_limit: number;
  badge?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

export interface Customer {
  id: string;
  merchant_id?: string;
  user_id?: string | null;
  activated_at?: string | null;
  name: string;
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  email?: string | null;
  notes: string | null;
  current_balance: number;
  alias?: string | null;
  credit_limit?: number;
  free_plan_selected?: boolean;
  created_at: string;
  estadoServidor?: EstadoServidor;
  isLinkedToMyStore?: boolean;
}

export interface FreePortfolioStatus {
  plan: SubscriptionPlan | string;
  effective_plan: SubscriptionPlan | string;
  limit: number;
  active_count: number;
  portfolio_count: number;
  selection_done: boolean;
  selection_pending: boolean;
  portfolio_enforced: boolean;
  remaining_slots: number;
}

export interface CreditEligibility {
  allowed: boolean;
  reason: 'paid_plan' | 'selected' | 'not_selected' | 'no_slots' | 'selection_pending' | 'unknown';
  message: string | null;
  limit: number;
  active_count: number;
  portfolio_count: number;
}

export interface CustomerStore {
  customer_id: string;
  store_id: string;
  current_balance: number;
  credit_limit: number;
  free_plan_selected?: boolean;
  active: boolean;
  stores?: {store_name: string; phone: string | null; address: string | null};
}

export interface UserStore {
  store_id: string;
  role: 'owner' | 'manager' | 'cashier' | string;
  store_name: string;
  phone: string | null;
  address: string | null;
  subscription_plan: string;
}

export interface Credit {
  id: string;
  store_id: string;
  customer_id: string;
  created_by: string;
  concept: string;
  amount: number;
  due_date: string | null;
  status: CreditStatus;
  created_at: string;
  estadoServidor?: EstadoServidor;
  // Joins opcionales
  customers?: Pick<Customer, 'id' | 'name' | 'phone' | 'alias'>;
}

export interface Payment {
  id: string;
  store_id: string;
  customer_id: string;
  credit_id: string | null;
  created_by: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
  estadoServidor?: EstadoServidor;
}

export interface NewCreditInput {
  customer_id: string;
  concept: string;
  amount: number;
  due_date?: string | null;
}

export interface NewPaymentInput {
  customer_id: string;
  credit_id?: string | null;
  amount: number;
  notes?: string | null;
}

export interface NewCustomerInput {
  name: string;
  document_type: string;
  document_number: string;
  phone?: string | null;
  email?: string | null;
  credit_limit?: number;
  alias?: string | null;
  notes?: string | null;
}
