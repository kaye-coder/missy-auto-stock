import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import missyLogo from "@/assets/missy-logo.png.asset.json";
import { getSession, login } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Missy" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useRouterState({ select: (r) => r.location.search as { redirect?: string } });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getSession()) navigate({ to: search?.redirect ?? "/" });
  }, [navigate, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      login(username, password);
      toast.success("Welcome back");
      navigate({ to: search?.redirect ?? "/" });
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-2xl">Missy Shop Console</CardTitle>
            <CardDescription>Sign in to manage the shop</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              <Lock className="mr-2 h-4 w-4" />
              {submitting ? "Signing in..." : "Sign in"}
            </Button>
            <p className="rounded-md border border-dashed border-border bg-muted/40 p-2 text-center text-xs text-muted-foreground">
              Demo credentials — username <span className="font-medium text-foreground">admin</span>{" "}
              / password <span className="font-medium text-foreground">admin</span>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
