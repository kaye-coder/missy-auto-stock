INSERT INTO public.accounts (code, name, type, created_at, updated_at) VALUES
  ('1000', 'Cash', 'asset', now(), now()),
  ('1010', 'Bank', 'asset', now(), now()),
  ('1100', 'Accounts Receivable', 'asset', now(), now()),
  ('1200', 'Inventory', 'asset', now(), now()),
  ('1300', 'VAT Input', 'asset', now(), now()),
  ('2000', 'Accounts Payable', 'liability', now(), now()),
  ('2100', 'VAT Output', 'liability', now(), now()),
  ('2200', 'WHT Payable', 'liability', now(), now()),
  ('4000', 'Sales Revenue', 'income', now(), now()),
  ('5000', 'Cost of Goods Sold', 'expense', now(), now()),
  ('6000', 'Expenses', 'expense', now(), now());