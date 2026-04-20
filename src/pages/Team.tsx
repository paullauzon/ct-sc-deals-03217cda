import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Mail, ShieldCheck, User as UserIcon, UserPlus } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  default_brand: string;
  created_at: string;
  role: "admin" | "rep" | null;
}

export default function TeamPage() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("id, name, email, default_brand, created_at").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) {
      toast.error("Failed to load team");
      setLoading(false);
      return;
    }
    const roleByUser = new Map<string, "admin" | "rep">();
    (rolesRes.data || []).forEach((r: any) => roleByUser.set(r.user_id, r.role));
    const rows: TeamMember[] = (profilesRes.data || []).map((p: any) => ({
      id: p.id,
      name: p.name || "",
      email: p.email || "",
      default_brand: p.default_brand || "Captarget",
      created_at: p.created_at,
      role: roleByUser.get(p.id) ?? null,
    }));
    setMembers(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRole = async (memberId: string, nextRole: "admin" | "rep") => {
    if (!isAdmin) return;
    if (memberId === user?.id && nextRole === "rep") {
      if (!window.confirm("Demote yourself from admin? You'll lose team management access.")) return;
    }
    setUpdatingId(memberId);
    try {
      // Delete existing roles for this user, then insert the target role.
      const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", memberId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("user_roles").insert({ user_id: memberId, role: nextRole });
      if (insErr) throw insErr;
      toast.success(`Role updated to ${nextRole}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Role update failed");
    } finally {
      setUpdatingId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="h-8 w-8 flex items-center justify-center rounded-md border border-border bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <h1 className="text-sm font-semibold tracking-tight">Team</h1>
          <span className="text-xs text-muted-foreground ml-2">
            {loading ? "Loading…" : `${members.length} ${members.length === 1 ? "member" : "members"}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {!isAdmin && (
              <span className="text-[11px] text-muted-foreground">Read-only · Admin required to manage roles</span>
            )}
            {isAdmin && <InviteTeammateDialog onInvited={load} />}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-10">Name</TableHead>
                <TableHead className="h-10">Email</TableHead>
                <TableHead className="h-10">Brand</TableHead>
                <TableHead className="h-10">Role</TableHead>
                <TableHead className="h-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
                  </TableCell>
                </TableRow>
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                    No team members yet.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => {
                  const isSelf = m.id === user?.id;
                  const isUpdating = updatingId === m.id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 flex items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
                            {initialsOf(m.name, m.email)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm">{m.name || "—"}{isSelf && <span className="ml-1.5 text-[10px] text-muted-foreground">(you)</span>}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-muted-foreground">{m.email}</TableCell>
                      <TableCell className="py-3 text-xs">{m.default_brand}</TableCell>
                      <TableCell className="py-3">
                        <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {m.role === "admin" ? <ShieldCheck className="h-2.5 w-2.5" /> : <UserIcon className="h-2.5 w-2.5" />}
                          {m.role || "none"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        {isAdmin ? (
                          m.role === "admin" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isUpdating}
                              onClick={() => setRole(m.id, "rep")}
                            >
                              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Demote to rep"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isUpdating}
                              onClick={() => setRole(m.id, "admin")}
                            >
                              {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Promote to admin"}
                            </Button>
                          )
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

function initialsOf(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function InviteTeammateDialog({ onInvited }: { onInvited: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "rep">("rep");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setEmail("");
    setName("");
    setRole("rep");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { email: trimmedEmail, name: name.trim(), role },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Invite sent to ${trimmedEmail}`);
      reset();
      setOpen(false);
      onInvited();
    } catch (err: any) {
      toast.error(err.message || "Failed to send invite");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 h-8 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Invite teammate</DialogTitle>
          <DialogDescription className="text-xs">
            They'll get a magic-link email. When they sign up, their role is applied automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email" className="text-xs">Work email</Label>
            <div className="relative">
              <Mail className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="pl-8"
                required
                disabled={submitting}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name" className="text-xs">Name (optional)</Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role" className="text-xs">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "admin" | "rep")} disabled={submitting}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rep">Rep — standard access</SelectItem>
                <SelectItem value="admin">Admin — can manage team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[120px]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
