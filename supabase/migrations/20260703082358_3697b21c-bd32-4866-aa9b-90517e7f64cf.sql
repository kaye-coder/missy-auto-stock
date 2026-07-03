
-- Allow unrestricted access to app tables (local single-user app)
DROP POLICY IF EXISTS "Authenticated can insert categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated can update categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated can delete categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can read categories" ON public.categories;
CREATE POLICY "Public full access categories" ON public.categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can delete products" ON public.products;
DROP POLICY IF EXISTS "Anyone can read products" ON public.products;
CREATE POLICY "Public full access products" ON public.products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated can read customers" ON public.customers;
CREATE POLICY "Public full access customers" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated can read sales" ON public.sales;
CREATE POLICY "Public full access sales" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can insert sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can update sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can delete sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Authenticated can read sale_items" ON public.sale_items;
CREATE POLICY "Public full access sale_items" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
