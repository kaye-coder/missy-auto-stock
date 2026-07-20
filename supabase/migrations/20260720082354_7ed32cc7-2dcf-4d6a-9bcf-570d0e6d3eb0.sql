CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  password_salt text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier', 'custom')),
  permissions text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx ON public.app_users (lower(username));
DROP TRIGGER IF EXISTS touch_app_users_updated_at ON public.app_users;
CREATE TRIGGER touch_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_sessions TO service_role;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS app_sessions_token_hash_idx ON public.app_sessions (token_hash);
CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON public.app_sessions (user_id);

INSERT INTO public.app_users (username, full_name, password_hash, password_salt, role, permissions, active)
VALUES (
  'admin',
  'Administrator',
  'd126155cabf49d4daa62390eabe3f9951ba394ec3539b720703a65ff79ee7a01',
  'missy-default-admin-v1',
  'admin',
  ARRAY['pos','inventory','categories','customers','suppliers','sales','purchases','expenses','accounting','reconciliation','statistics','settings','users']::text[],
  true
)
ON CONFLICT (lower(username)) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  permissions = EXCLUDED.permissions,
  active = true,
  updated_at = now();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounts', 'categories', 'customers', 'expenses', 'journal_entries', 'journal_lines',
    'products', 'purchase_items', 'purchases', 'sale_items', 'sales', 'suppliers'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;