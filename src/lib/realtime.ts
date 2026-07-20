import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLE_TO_KEYS: Record<string, string[]> = {
  accounts: ["accounts", "journal", "reconciliation"],
  categories: ["categories", "products"],
  customers: ["customers", "sales"],
  expenses: ["expenses", "journal"],
  journal_entries: ["journal", "reconciliation"],
  journal_lines: ["journal", "reconciliation"],
  products: ["products", "sale_items", "sale_items_all"],
  purchase_items: ["purchase_items", "products", "journal"],
  purchases: ["purchases", "products", "journal"],
  sale_items: ["sale_items", "sale_items_all", "products", "journal"],
  sales: ["sales", "sale_items", "sale_items_all", "journal"],
  suppliers: ["suppliers", "purchases", "expenses"],
};

export function useRealtimeInvalidation(queryClient: QueryClient, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel("missy-live-data");
    Object.keys(TABLE_TO_KEYS).forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of TABLE_TO_KEYS[table]) queryClient.invalidateQueries({ queryKey: [key] });
      });
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, enabled]);
}