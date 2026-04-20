import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User as UserIcon, Users, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { clearActivityActorCache } from "@/lib/activityLog";

function initialsFromName(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) return "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserMenu() {
  const navigate = useNavigate();
  const { profile, user, role, isAdmin, signOut } = useAuth();
  const displayName = profile?.name || (user?.user_metadata as any)?.name || user?.email?.split("@")[0] || "Account";
  const displayEmail = profile?.email || user?.email || "";
  const initials = initialsFromName(profile?.name, displayEmail);

  const onSignOut = async () => {
    try {
      await signOut();
      clearActivityActorCache();
      toast.success("Signed out");
      navigate("/auth", { replace: true });
    } catch {
      toast.error("Sign out failed");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-8 w-8 flex items-center justify-center rounded-full border border-border bg-secondary/50 text-[11px] font-semibold text-foreground hover:bg-secondary transition-colors"
          title={displayName}
          aria-label="User menu"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
          <span className="text-[11px] text-muted-foreground truncate font-normal">{displayEmail}</span>
          {role && (
            <span className="mt-1.5 inline-flex items-center gap-1 self-start rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {role === "admin" && <ShieldCheck className="h-2.5 w-2.5" />}
              {role}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2 text-sm cursor-pointer">
          <UserIcon className="h-3.5 w-3.5" /> Profile
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onClick={() => navigate("/settings/team")} className="gap-2 text-sm cursor-pointer">
            <Users className="h-3.5 w-3.5" /> Team
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut} className="gap-2 text-sm cursor-pointer text-muted-foreground">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
