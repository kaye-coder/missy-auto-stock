-- Offline bootstrap SQL — runs AFTER all supabase/migrations/*.sql have been applied.
-- Creates storage buckets that on Supabase Cloud were created via the dashboard.
-- Idempotent; safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', false)
ON CONFLICT (id) DO NOTHING;
