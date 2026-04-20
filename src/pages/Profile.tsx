import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, LogOut, ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { clearActivityActorCache } from "@/lib/activityLog";

function formatJoined(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function initialsOf(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function providerLabel(user: any): string {
  const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider;
  if (provider === "google") return "Signed in via Google";
  if (provider === "email") return "Email & password";
  if (typeof provider === "string" && provider.length) return `Signed in via ${provider}`;
  return "Email & password";
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, role, loading, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState("");
  const [defaultBrand, setDefaultBrand] = useState("Captarget");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setDefaultBrand(profile.default_brand || "Captarget");
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim(), default_brand: defaultBrand, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Profile updated");
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    await signOut();
    clearActivityActorCache();
    navigate("/auth", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <h1 className="text-sm font-semibold tracking-tight">Your profile</h1>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <section className="flex items-center gap-4">
          <div className="h-14 w-14 flex items-center justify-center rounded-full bg-foreground text-background text-sm font-semibold">
            {initialsOf(profile?.name, profile?.email)}
          </div>
          <div className="space-y-1">
            <div className="text-base font-medium text-foreground">{profile?.name || "Unnamed user"}</div>
            <div className="text-xs text-muted-foreground">{profile?.email}</div>
            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {role === "admin" ? <ShieldCheck className="h-2.5 w-2.5" /> : <UserIcon className="h-2.5 w-2.5" />}
                {role || "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Joined {formatJoined(profile?.created_at)}
              </span>
            </div>
          </div>
        </section>

        <section className="border border-border rounded-lg bg-card p-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Sign-in method</span>
            <span className="text-foreground">{providerLabel(user)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Last sign-in</span>
            <span className="text-foreground">{formatDateTime((user as any)?.last_sign_in_at)}</span>
          </div>
        </section>

        <section className="border border-border rounded-lg bg-card p-6">
          <h2 className="text-sm font-medium mb-4">Account details</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input id="email" value={profile?.email || ""} disabled readOnly />
              <p className="text-[10px] text-muted-foreground">Email is tied to your login and cannot be changed here.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand" className="text-xs">Default brand</Label>
              <Select value={defaultBrand} onValueChange={setDefaultBrand} disabled={busy}>
                <SelectTrigger id="brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Captarget">Captarget</SelectItem>
                  <SelectItem value="SourceCo">SourceCo</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Used to scope new leads and filter defaults.</p>
            </div>
            <div className="pt-2 flex items-center justify-between">
              <Button type="submit" disabled={busy} className="min-w-[120px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
              <Button type="button" variant="outline" onClick={onSignOut} className="gap-2">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
