import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Eye, EyeOff, ShieldCheck, Zap, Activity } from "lucide-react";
import { toast } from "sonner";

function GoogleGMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

function humanizeAuthError(msg: string, mode: "signin" | "signup"): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "Incorrect email or password.";
  if (m.includes("user already registered") || m.includes("already exists")) return "An account with that email already exists. Try signing in.";
  if (m.includes("email not confirmed")) return "Please confirm your email address before signing in.";
  if (m.includes("password") && m.includes("short")) return "Password must be at least 8 characters.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  return mode === "signup" ? "Couldn't create the account. " + msg : "Couldn't sign in. " + msg;
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { session, loading: sessionLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sessionLoading && session) navigate("/", { replace: true });
  }, [session, sessionLoading, navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name: name.trim() },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(humanizeAuthError(err.message || "Authentication failed", mode));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message || "Google sign-in failed");
        setBusy(false);
        return;
      }
      // If redirected, browser will navigate; if tokens received, AuthContext picks it up
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-5 bg-background">
      {/* Brand panel (desktop only) */}
      <aside className="hidden md:flex md:col-span-2 relative bg-foreground text-background p-10 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
             style={{ backgroundImage: "radial-gradient(circle at 30% 20%, hsl(var(--background)) 0, transparent 40%), radial-gradient(circle at 70% 80%, hsl(var(--background)) 0, transparent 40%)" }} />
        <div className="relative flex items-center gap-3">
          <img src="/captarget-logo.png" alt="Captarget" className="h-7 object-contain invert brightness-0" draggable={false} />
          <span className="h-4 w-px bg-background/30" />
          <img src="/sourceco-logo.png" alt="SourceCo" className="h-5 object-contain invert brightness-0 opacity-80" draggable={false} />
        </div>

        <div className="relative space-y-6">
          <h2 className="text-2xl font-semibold tracking-tight leading-tight">
            The deal pipeline, without the guesswork.
          </h2>
          <p className="text-sm text-background/70 leading-relaxed max-w-xs">
            One workspace for Captarget and SourceCo — every meeting, email, and signal synthesized into one source of truth.
          </p>

          <ul className="space-y-3 text-sm text-background/80 pt-2">
            <li className="flex items-start gap-3">
              <Activity className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Automated meeting intelligence from Fireflies</span>
            </li>
            <li className="flex items-start gap-3">
              <Zap className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Next-step signals prioritized for every deal</span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Every action attributed — full audit trail</span>
            </li>
          </ul>
        </div>

        <p className="relative text-[11px] text-background/50">
          © {new Date().getFullYear()} Captarget · SourceCo
        </p>
      </aside>

      {/* Form panel */}
      <main className="md:col-span-3 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-3 mb-6 justify-center">
            <img src="/captarget-logo.png" alt="Captarget" className="h-6 object-contain" draggable={false} />
            <span className="h-4 w-px bg-border" />
            <img src="/sourceco-logo.png" alt="SourceCo" className="h-4 object-contain opacity-80" draggable={false} />
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "signin"
                ? "Sign in to access the deal pipeline."
                : "First account becomes admin automatically."}
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 gap-2.5"
            onClick={handleGoogle}
            disabled={busy}
            type="button"
          >
            <GoogleGMark className="h-4 w-4" />
            <span className="text-sm">Continue with Google</span>
          </Button>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
              <span className="bg-background px-2 text-muted-foreground">or with email</span>
            </div>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="signin-email" className="text-xs">Email</Label>
                  <Input id="signin-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-pw" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      id="signin-pw"
                      type={showPw ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-10" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleEmailAuth} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name" className="text-xs">Full name</Label>
                  <Input id="signup-name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email" className="text-xs">Email</Label>
                  <Input id="signup-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-pw" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-pw"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Minimum 8 characters.</p>
                </div>
                <Button type="submit" className="w-full h-10" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
