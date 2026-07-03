
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS reconciled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_journal_lines_reconciled ON public.journal_lines(account_id, reconciled);
