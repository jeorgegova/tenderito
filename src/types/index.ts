// Interfaces TypeScript basadas en esquema Supabase Tenderito

export type SubscriptionPlan = "free" | "basic" | "pro";
export type CreditStatus = "pending" | "partially_paid" | "paid";

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
  merchant_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  current_balance: number;
  created_at: string;
}

export interface Credit {
  id: string;
  merchant_id: string;
  customer_id: string;
  concept: string;
  amount: number;
  due_date: string | null;
  status: CreditStatus;
  created_at: string;
  // Joins opcionales
  customers?: Pick<Customer, "id" | "name" | "phone">;
}

export interface Payment {
  id: string;
  merchant_id: string;
  customer_id: string;
  credit_id: string | null;
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
  phone?: string | null;
  notes?: string | null;
}
