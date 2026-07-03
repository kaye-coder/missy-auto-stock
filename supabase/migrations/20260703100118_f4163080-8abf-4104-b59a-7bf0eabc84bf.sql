
CREATE OR REPLACE FUNCTION public.on_sale_item_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE public.products
      SET stock = GREATEST(0, stock - NEW.quantity), updated_at = now()
      WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.on_sale_item_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.product_id IS NOT NULL THEN
    UPDATE public.products
      SET stock = stock + OLD.quantity, updated_at = now()
      WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_sale_item_insert ON public.sale_items;
CREATE TRIGGER trg_sale_item_insert
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.on_sale_item_insert();

DROP TRIGGER IF EXISTS trg_sale_item_delete ON public.sale_items;
CREATE TRIGGER trg_sale_item_delete
  BEFORE DELETE ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.on_sale_item_delete();
