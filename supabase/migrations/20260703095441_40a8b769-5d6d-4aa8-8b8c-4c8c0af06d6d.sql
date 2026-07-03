
-- Attach missing triggers so sales, purchases, and expenses automatically
-- affect inventory and the accounting module (ledger, balance sheet, P&L).

-- SALES: post journal on insert, cleanup on delete
DROP TRIGGER IF EXISTS trg_post_sale_journal ON public.sales;
CREATE TRIGGER trg_post_sale_journal
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_journal();

DROP TRIGGER IF EXISTS trg_delete_sale_journal ON public.sales;
CREATE TRIGGER trg_delete_sale_journal
  BEFORE DELETE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();

-- SALE ITEMS: post COGS per line
DROP TRIGGER IF EXISTS trg_post_sale_item_cogs ON public.sale_items;
CREATE TRIGGER trg_post_sale_item_cogs
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.post_sale_item_cogs();

-- PURCHASES: post journal / cleanup
DROP TRIGGER IF EXISTS trg_post_purchase_journal ON public.purchases;
CREATE TRIGGER trg_post_purchase_journal
  AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.post_purchase_journal();

DROP TRIGGER IF EXISTS trg_delete_purchase_journal ON public.purchases;
CREATE TRIGGER trg_delete_purchase_journal
  BEFORE DELETE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();

-- PURCHASE ITEMS: increment / decrement inventory stock
DROP TRIGGER IF EXISTS trg_purchase_item_insert ON public.purchase_items;
CREATE TRIGGER trg_purchase_item_insert
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_item_insert();

DROP TRIGGER IF EXISTS trg_purchase_item_delete ON public.purchase_items;
CREATE TRIGGER trg_purchase_item_delete
  BEFORE DELETE ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.on_purchase_item_delete();

-- EXPENSES: post journal / cleanup
DROP TRIGGER IF EXISTS trg_post_expense_journal ON public.expenses;
CREATE TRIGGER trg_post_expense_journal
  AFTER INSERT ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.post_expense_journal();

DROP TRIGGER IF EXISTS trg_delete_expense_journal ON public.expenses;
CREATE TRIGGER trg_delete_expense_journal
  BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.delete_journal_by_source();
