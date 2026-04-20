import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Plus, Pencil, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export interface EmailTemplate {
  id: string;
  name: string;
  brand: string;
  category: string;
  subject_template: string;
  body_template: string;
  usage_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const BRANDS = ["Captarget", "SourceCo", "Both"];
const CATEGORIES = ["discovery", "follow-up", "proposal", "proof", "re-engage", "scheduling", "general"];

/** Parse {{token}} variables out of a body template */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([a-z_]+)\}\}/gi) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/[{}]/g, ""))));
}

export function EmailTemplatesPanel() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_templates")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    setTemplates((data || []) as EmailTemplate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("email_templates").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Template deleted");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Reusable subject + body templates. Reps can insert these from the compose drawer.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New template
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading…
          </div>
        ) : templates.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">No templates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first reusable email template to save typing.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Brand</th>
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-left px-4 py-2.5 font-medium">Variables</th>
                <th className="text-right px-4 py-2.5 font-medium">Used</th>
                <th className="text-left px-4 py-2.5 font-medium pl-4">Updated</th>
                <th className="text-right px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {templates.map((t) => {
                const vars = extractVariables(`${t.subject_template}\n${t.body_template}`);
                return (
                  <tr key={t.id} className="hover:bg-secondary/20 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                        {t.subject_template || "(no subject)"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">{t.brand}</td>
                    <td className="px-4 py-3 text-xs capitalize">{t.category}</td>
                    <td className="px-4 py-3">
                      {vars.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">none</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {vars.slice(0, 4).map((v) => (
                            <Badge key={v} variant="outline" className="text-[9px] font-mono">{v}</Badge>
                          ))}
                          {vars.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{vars.length - 4}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums">{t.usage_count}</td>
                    <td className="px-4 py-3 pl-4 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(t)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-foreground"
                          onClick={() => remove(t.id, t.name)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1.5 pt-2">
        <p className="font-medium text-foreground">Available variables</p>
        <p className="font-mono text-[11px]">
          {"{{first_name}}  {{name}}  {{company}}  {{role}}  {{deal_value}}  {{stage}}  {{my_name}}"}
        </p>
        <p>Variables are replaced when a template is inserted into the compose drawer.</p>
      </div>

      {(editing || creating) && (
        <TemplateEditor
          template={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  template, onClose, onSaved,
}: {
  template: EmailTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name || "");
  const [brand, setBrand] = useState(template?.brand || "Both");
  const [category, setCategory] = useState(template?.category || "general");
  const [subject, setSubject] = useState(template?.subject_template || "");
  const [body, setBody] = useState(template?.body_template || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (isEdit && template) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            name: name.trim(), brand, category,
            subject_template: subject, body_template: body,
            updated_at: new Date().toISOString(),
          })
          .eq("id", template.id);
        if (error) throw error;
        toast.success("Template updated");
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert({
            name: name.trim(), brand, category,
            subject_template: subject, body_template: body,
          });
        if (error) throw error;
        toast.success("Template created");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-5 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-sm font-semibold">
            {isEdit ? "Edit template" : "New template"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm mt-1" placeholder="e.g. Discovery follow-up" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Brand</Label>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full h-9 mt-1 text-sm bg-background border border-input rounded-md px-2"
              >
                {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 mt-1 text-sm bg-background border border-input rounded-md px-2 capitalize"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-sm mt-1" placeholder="e.g. {{first_name}}, quick follow-up" />
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Body</Label>
            <Textarea
              value={body} onChange={(e) => setBody(e.target.value)}
              rows={16} className="text-sm font-mono resize-none mt-1"
              placeholder={"Hi {{first_name}},\n\nQuick follow-up on {{company}}…"}
            />
          </div>
          <div className="text-[10px] text-muted-foreground">
            Variables: <span className="font-mono">{"{{first_name}}, {{name}}, {{company}}, {{role}}, {{deal_value}}, {{stage}}, {{my_name}}"}</span>
          </div>
        </div>
        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-background">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            {saving ? "Saving…" : (isEdit ? "Save changes" : "Create template")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
