// Interfaces TypeScript basadas en esquema Supabase Tenderito

export type SubscriptionPlan = 'free' | 'basic' | 'pro';
export type CreditStatus = 'pending' | 'partially_paid' | 'paid';

export interface Profile {
  id: string;
  store_name: string;
  merchant_name: string;
  phone: string | null;
  subscription_plan: SubscriptionPlan;
  created_at: string;
}

export interface Customer {
  id: string;
  merchant_id?: string;
  name: string;
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  email?: string | null;
  notes: string | null;
  current_balance: number;
  alias?: string | null;
  credit_limit?: number;
  created_at: string;
}

export interface CustomerStore {
  customer_id: string;
  store_id: string;
  current_balance: number;
  credit_limit: number;
  active: boolean;
  stores?: {store_name: string; phone: string | null; address: string | null};
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
  // Joins opcionales
  customers?: Pick<Customer, 'id' | 'name' | 'phone'>;
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
