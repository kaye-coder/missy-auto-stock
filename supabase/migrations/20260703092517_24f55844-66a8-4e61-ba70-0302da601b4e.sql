
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0;

-- Backfill: assume prior sales fully paid unless payment_method = 'credit'
UPDATE public.sales
  SET amount_paid = CASE WHEN payment_method = 'credit' THEN 0 ELSE total END,
      balance_due = CASE WHEN payment_method = 'credit' THEN total ELSE 0 END
  WHERE amount_paid = 0 AND balance_due = 0;

CREATE OR REPLACE FUNCTION public.post_sale_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry uuid;
  v_pay_acct uuid;
  v_net numeric;
  v_paid numeric;
  v_credit numeric;
BEGIN
  v_net := COALESCE(NEW.subtotal,0) - COALESCE(NEW.discount,0);
  v_paid := LEAST(COALESCE(NEW.amount_paid, NEW.total), NEW.total);
  v_credit := GREATEST(NEW.total - v_paid, 0);

  v_pay_acct := CASE
    WHEN NEW.payment_method IN ('bank','card','mobile','mpesa','transfer') THEN acct('1010')
    ELSE acct('1000')
  END;

  INSERT INTO public.journal_entries(entry_date, reference, memo, source_type, source_id)
    VALUES (NEW.created_at::date, NEW.receipt_number, 'Sale ' || NEW.receipt_number, 'sale', NEW.id)
    RETURNING id INTO v_entry;

  -- Dr Cash/Bank for the paid portion
  IF v_paid > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, v_pay_acct, v_paid, 0, 'Sale payment received');
  END IF;
  -- Dr Accounts Receivable for the credit portion
  IF v_credit > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('1100'), v_credit, 0, 'Credit sale — balance due');
  END IF;
  -- Cr Sales Revenue (net of discount)
  INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
    VALUES (v_entry, acct('4000'), 0, v_net, 'Sales revenue');
  -- Cr VAT Output
  IF COALESCE(NEW.tax,0) > 0 THEN
    INSERT INTO public.journal_lines(entry_id, account_id, debit, credit, description)
      VALUES (v_entry, acct('2100'), 0, NEW.tax, 'VAT output');
  END IF;
  RETURN NEW;
END; $function$;
