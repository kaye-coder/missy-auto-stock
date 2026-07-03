export interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  category_id: string | null;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  receipt_number: string;
  customer_id: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  payment_method: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tin_number: string | null;
  notes: string | null;
  created_at: string;
}

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  efris_tax_code: string | null;
  is_system: boolean;
  active: boolean;
  description: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string | null;
  supplier_invoice: string | null;
  purchase_date: string;
  subtotal: number;
  vat_input: number;
  wht: number;
  total: number;
  payment_method: string;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

export interface Expense {
  id: string;
  expense_date: string;
  account_id: string | null;
  category: string;
  description: string | null;
  amount: number;
  vat_input: number;
  wht: number;
  total: number;
  payment_method: string;
  reference: string | null;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  reference: string;
  memo: string | null;
  source_type: string;
  source_id: string | null;
  posted: boolean;
  created_at: string;
}

export interface JournalLine {
  id: string;
  entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  reconciled: boolean;
  reconciled_at: string | null;
}
