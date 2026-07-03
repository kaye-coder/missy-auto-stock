
-- =========================================================
-- SUPPLIERS
-- =========================================================
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  tin_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO anon, authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access suppliers" ON public.suppliers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_suppliers_touch BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- CHART OF ACCOUNTS
-- =========================================================
CREATE TYPE public.account_type AS ENUM ('asset','liability','equity','income','expense');

CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type public.account_type NOT NULL,
  parent_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  efris_tax_code text,
  is_system boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO anon, authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access accounts" ON public.accounts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_accounts_touch BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed Ugandan-standard COA
INSERT INTO public.accounts (code, name, type, is_system, efris_tax_code) VALUES
  ('1000','Cash on Hand','asset',true,null),
  ('1010','Bank Account','asset',true,null),
  ('1100','Accounts Receivable','asset',true,null),
  ('1200','Inventory','asset',true,null),
  ('1300','VAT Input (Recoverable)','asset',true,'01'),
  ('2000','Accounts Payable','liability',true,null),
  ('2100','VAT Output (Payable)','liability',true,'01'),
  ('2200','WHT Payable (URA)','liability',true,null),
  ('2300','Local Service Tax Payable','liability',true,null),
  ('3000','Owner''s Equity','equity',true,null),
  ('3100','Retained Earnings','equity',true,null),
  ('4000','Sales Revenue','income',true,'01'),
  ('4100','Sales Discounts','income',true,null),
  ('5000','Cost of Goods Sold','expense',true,null),
  ('6000','Operating Expenses','expense',true,null),
  ('6100','Rent Expense','expense',false,null),
  ('6200','Utilities Expense','expense',false,null),
  ('6300','Salaries & Wages','expense',false,null),
  ('6400','Transport & Fuel','expense',false,null),
  ('6500','Office Supplies','expense',false,null),
  ('6600','Repairs & Maintenance','expense',false,null),
  ('6700','Marketing & Advertising','expense',false,null),
  ('6900','Miscellaneous Expense','expense',false,null);

-- =========================================================
-- PURCHASES
-- =========================================================
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number text NOT NULL DEFAULT ('PO-' || to_char(now(),'YYYYMMDD') || '-' || lpad((floor(random()*100000))::text, 5, '0')),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_invoice text,
  purchase_date date NOT NULL DEFAULT current_date,
  subtotal numeric NOT NULL DEFAULT 0,
  vat_input numeric NOT NULL DEFAULT 0,
  wht numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash', -- cash | bank | credit
  status text NOT NULL DEFAULT 'received',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO anon, authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access purchases" ON public.purchases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_purchases_touch BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT, -- MUST be existing inventory
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric NOT NULL CHECK (unit_cost >= 0),
  subtotal numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO anon, authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access purchase_items" ON public.purchase_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Auto stock increment + cost update when purchase item added
CREATE OR REPLACE FUNCTION public.on_purchase_item_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.products
    SET stock = stock + NEW.quantity,
        cost = NEW.unit_cost,
        updated_at = now()
    WHERE id = NEW.product_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_purchase_item_insert AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_item_insert();

-- =========================================================
-- EXPENSES
-- =========================================================
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT current_date,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL CHECK (amount >= 0),
  vat_input numeric NOT NULL DEFAULT 0,
  wht numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  reference text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO anon, authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access expenses" ON public.expenses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_expenses_touch BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- JOURNAL (double-entry ledger)
-- =========================================================
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT current_date,
  reference text NOT NULL,
  memo text,
  source_type text NOT NULL, -- 'sale' | 'purchase' | 'expense' | 'manual'
  source_id uuid,
  posted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO anon, authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access journal_entries" ON public.journal_entries FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  debit numeric NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO anon, authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access journal_lines" ON public.journal_lines FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_journal_lines_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON public.journal_lines(account_id);
CREATE INDEX idx_journal_entries_date ON public.journal_entries(entry_date);

-- Helper to fetch account id by code
CREATE OR REPLACE FUNCTION public.acct(_code text)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT id FROM public.accounts WHERE code = _code LIMIT 1;
$$;

-- =========================================================
-- AUTO-POSTING TRIGGERS
-- =========================================================

-- SALES: on sale insert -> post revenue, VAT, cash/AR
CREATE OR REPLACE FUNCTION public.post_sale_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_entry uuid;
  v_debit_acct uuid;
  v_net numeric;
BEGIN
  v_net := COALESCE(NEW.subtotal,0) - COALESCE(NEW.discount,0);
  -- pick debit account by payment method
  v_debit_acct := CASE
    WHEN NEW.payment_method = 'bank' OR NEW.payment_method = 'card' OR NEW.payment_method = 'mobile' THEN acct('1010')
    WHEN NEW.payment_method = 'credit' THEN acct('1100')
    ELSE acct('1000')
  END;

  INSERT INTO public.journal_entries(entry_date, reference, memo, source_type, source_id)
    VALUES (NEW.created_at::date, NEW.receipt_number, 'Sale ' || NEW.receipt_number, 'sale', NEW.id)
    RETURNING id INTO v_entry;

  -- Dr Cash/Bank/AR (total)
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, v_debit_acct, NEW.total, 0, 'Sale received');
  -- Cr Sales Revenue (net of discount)
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, acct('4000'), 0, v_net, 'Sales revenue');
  -- Cr VAT Output
  IF COALESCE(NEW.tax,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('2100'), 0, NEW.tax, 'VAT output');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_sale AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_journal();

-- SALE ITEM: post COGS/Inventory per item at product cost
CREATE OR REPLACE FUNCTION public.post_sale_item_cogs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_entry uuid;
  v_cost numeric;
  v_total numeric;
  v_ref text;
BEGIN
  SELECT cost INTO v_cost FROM public.products WHERE id = NEW.product_id;
  IF v_cost IS NULL OR v_cost = 0 THEN RETURN NEW; END IF;
  v_total := v_cost * NEW.quantity;
  SELECT receipt_number INTO v_ref FROM public.sales WHERE id = NEW.sale_id;

  INSERT INTO public.journal_entries(entry_date, reference, memo, source_type, source_id)
    VALUES (current_date, COALESCE(v_ref,'SALE') || '-COGS', 'COGS ' || NEW.product_name, 'sale', NEW.sale_id)
    RETURNING id INTO v_entry;
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, acct('5000'), v_total, 0, NEW.product_name);
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, acct('1200'), 0, v_total, NEW.product_name);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_sale_item AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_item_cogs();

-- PURCHASES: on insert -> post inventory, VAT input, AP/Cash
CREATE OR REPLACE FUNCTION public.post_purchase_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_entry uuid;
  v_credit_acct uuid;
BEGIN
  v_credit_acct := CASE
    WHEN NEW.payment_method = 'bank' THEN acct('1010')
    WHEN NEW.payment_method = 'credit' THEN acct('2000')
    ELSE acct('1000')
  END;

  INSERT INTO public.journal_entries(entry_date, reference, memo, source_type, source_id)
    VALUES (NEW.purchase_date, NEW.purchase_number, 'Purchase ' || NEW.purchase_number, 'purchase', NEW.id)
    RETURNING id INTO v_entry;

  -- Dr Inventory (subtotal)
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, acct('1200'), NEW.subtotal, 0, 'Inventory purchased');
  -- Dr VAT Input
  IF COALESCE(NEW.vat_input,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('1300'), NEW.vat_input, 0, 'VAT input');
  END IF;
  -- Cr WHT Payable
  IF COALESCE(NEW.wht,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('2200'), 0, NEW.wht, 'Withholding tax');
  END IF;
  -- Cr Cash/Bank/AP (net after WHT)
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, v_credit_acct, 0, NEW.total - COALESCE(NEW.wht,0), 'Payment to supplier');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_purchase AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_journal();

-- EXPENSES: on insert -> Dr Expense (+VAT input), Cr Cash/Bank/AP, Cr WHT
CREATE OR REPLACE FUNCTION public.post_expense_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_entry uuid;
  v_credit_acct uuid;
  v_exp_acct uuid;
BEGIN
  v_credit_acct := CASE
    WHEN NEW.payment_method = 'bank' THEN acct('1010')
    WHEN NEW.payment_method = 'credit' THEN acct('2000')
    ELSE acct('1000')
  END;
  v_exp_acct := COALESCE(NEW.account_id, acct('6000'));

  INSERT INTO public.journal_entries(entry_date, reference, memo, source_type, source_id)
    VALUES (NEW.expense_date, COALESCE(NEW.reference,'EXP-'||substring(NEW.id::text,1,8)), NEW.category || ' — ' || COALESCE(NEW.description,''), 'expense', NEW.id)
    RETURNING id INTO v_entry;

  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, v_exp_acct, NEW.amount, 0, NEW.category);
  IF COALESCE(NEW.vat_input,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('1300'), NEW.vat_input, 0, 'VAT input');
  END IF;
  IF COALESCE(NEW.wht,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('2200'), 0, NEW.wht, 'WHT withheld');
  END IF;
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, v_credit_acct, 0, NEW.total - COALESCE(NEW.wht,0), 'Payment');
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_post_expense AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.post_expense_journal();

-- Reverse journal when source is deleted
CREATE OR REPLACE FUNCTION public.delete_journal_by_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.journal_entries WHERE source_id = OLD.id;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_del_sale_journal BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();
CREATE TRIGGER trg_del_purchase_journal BEFORE DELETE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();
CREATE TRIGGER trg_del_expense_journal BEFORE DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();

-- Reverse stock on purchase item delete
CREATE OR REPLACE FUNCTION public.on_purchase_item_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.products SET stock = GREATEST(0, stock - OLD.quantity), updated_at = now() WHERE id = OLD.product_id;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_purchase_item_delete BEFORE DELETE ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.on_purchase_item_delete();
