import { useState, useEffect, useMemo } from "react";
import { Lead, Brand, ServiceInterest } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo } from "@/components/BrandLogo";
import { ChevronDown, ChevronLeft, ChevronRight, Save, DollarSign, Users, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInMonths, parseISO, addMonths, subMonths, parse } from "date-fns";

const BRANDS: Brand[] = ["Captarget", "SourceCo"];

const SERVICE_TYPES: ServiceInterest[] = [
  "Off-Market Email Origination",
  "Direct Calling",
  "Banker/Broker Coverage",
  "Full Platform (All 3)",
  "SourceCo Retained Search",
];

interface CostInputs {
  sales_cost: number;
  tool_cost: number;
  ad_spend: number;
  margin_pct: Record<string, number>;
}

const DEFAULT_COSTS: CostInputs = { sales_cost: 0, tool_cost: 0, ad_spend: 0, margin_pct: {} };

function currentMonth() {
  return format(new Date(), "yyyy-MM");
}

interface Props {
  leads: Lead[];
}

export function DashboardEconomics({ leads }: Props) {
  const [month, setMonth] = useState(currentMonth());
  const [costs, setCosts] = useState<Record<Brand, CostInputs>>({
    Captarget: { ...DEFAULT_COSTS },
    SourceCo: { ...DEFAULT_COSTS },
  });
  const [configOpen, setConfigOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from DB
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("business_cost_inputs" as any)
        .select("*")
        .eq("month", month);

      const rows = (data || []) as any[];
      const next: Record<Brand, CostInputs> = {
        Captarget: { ...DEFAULT_COSTS, margin_pct: {} },
        SourceCo: { ...DEFAULT_COSTS, margin_pct: {} },
      };
      for (const r of rows) {
        if (r.brand === "Captarget" || r.brand === "SourceCo") {
          next[r.brand as Brand] = {
            sales_cost: Number(r.sales_cost) || 0,
            tool_cost: Number(r.tool_cost) || 0,
            ad_spend: Number(r.ad_spend) || 0,
            margin_pct: (r.margin_pct as Record<string, number>) || {},
          };
        }
      }
      setCosts(next);
      setLoaded(true);
    }
    load();
  }, [month]);

  // Save
  async function handleSave() {
    setSaving(true);
    for (const brand of BRANDS) {
      const c = costs[brand];
      const { error } = await supabase.from("business_cost_inputs" as any).upsert(
        {
          brand,
          month,
          sales_cost: c.sales_cost,
          tool_cost: c.tool_cost,
          ad_spend: c.ad_spend,
          margin_pct: c.margin_pct,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "brand,month" }
      );
      if (error) {
        toast.error(`Failed to save ${brand}: ${error.message}`);
        setSaving(false);
        return;
      }
    }
    toast.success("Cost inputs saved");
    setSaving(false);
  }

  function updateCost(brand: Brand, field: keyof Omit<CostInputs, "margin_pct">, val: number) {
    setCosts((prev) => ({ ...prev, [brand]: { ...prev[brand], [field]: val } }));
  }

  function updateMargin(brand: Brand, service: string, pct: number) {
    setCosts((prev) => ({
      ...prev,
      [brand]: { ...prev[brand], margin_pct: { ...prev[brand].margin_pct, [service]: pct } },
    }));
  }

  // Compute metrics
  const metrics = useMemo(() => {
    const result: Record<Brand, {
      totalCost: number;
      newCustomers: number;
      cac: number | null;
      avgSubscription: number;
      avgContractMonths: number | null;
      ltv: number | null;
      ltvCacRatio: number | null;
    }> = {} as any;

    for (const brand of BRANDS) {
      const c = costs[brand];
      const totalCost = c.sales_cost + c.tool_cost + c.ad_spend;

      // Won deals in selected month
      const wonDeals = leads.filter(
        (l) => l.brand === brand && l.stage === "Closed Won" && l.closedDate?.startsWith(month)
      );
      const newCustomers = wonDeals.length;
      const cac = newCustomers > 0 ? totalCost / newCustomers : null;

      // All won deals for LTV
      const allWon = leads.filter((l) => l.brand === brand && l.stage === "Closed Won");
      const avgSubscription = allWon.length > 0
        ? allWon.reduce((s, l) => s + (l.subscriptionValue || 0), 0) / allWon.length
        : 0;

      // Contract duration
      const contractDeals = allWon.filter((l) => l.contractStart && l.contractEnd);
      let avgContractMonths: number | null = null;
      if (contractDeals.length > 0) {
        const totalMonths = contractDeals.reduce((s, l) => {
          try {
            return s + Math.max(1, differenceInMonths(parseISO(l.contractEnd), parseISO(l.contractStart)));
          } catch {
            return s;
          }
        }, 0);
        avgContractMonths = totalMonths / contractDeals.length;
      }

      const ltv = avgContractMonths != null ? avgSubscription * avgContractMonths : null;
      const ltvCacRatio = ltv != null && cac != null && cac > 0 ? ltv / cac : null;

      result[brand] = { totalCost, newCustomers, cac, avgSubscription, avgContractMonths, ltv, ltvCacRatio };
    }
    return result;
  }, [leads, costs, month]);

  // Gross margin data
  const marginData = useMemo(() => {
    const rows: {
      brand: Brand;
      service: string;
      dealCount: number;
      totalValue: number;
      marginPct: number;
      grossProfit: number;
    }[] = [];

    for (const brand of BRANDS) {
      const brandLeads = leads.filter(
        (l) => l.brand === brand && !["Closed Lost", "Went Dark"].includes(l.stage) && l.serviceInterest && l.serviceInterest !== "TBD"
      );
      const byService = new Map<string, Lead[]>();
      for (const l of brandLeads) {
        const arr = byService.get(l.serviceInterest) || [];
        arr.push(l);
        byService.set(l.serviceInterest, arr);
      }
      for (const [service, svcLeads] of byService) {
        const totalValue = svcLeads.reduce((s, l) => s + (l.dealValue || 0), 0);
        const marginPct = costs[brand].margin_pct[service] ?? 0;
        rows.push({
          brand,
          service,
          dealCount: svcLeads.length,
          totalValue,
          marginPct,
          grossProfit: totalValue * (marginPct / 100),
        });
      }
    }
    return rows;
  }, [leads, costs]);

  const fmt = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  function ratioColor(ratio: number | null) {
    if (ratio == null) return "text-muted-foreground";
    if (ratio >= 3) return "text-emerald-500";
    if (ratio >= 1) return "text-amber-500";
    return "text-red-500";
  }

  return (
    <div className="space-y-6">
      {/* Cost Configuration */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings2Icon className="h-4 w-4" />
                  Cost Configuration
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-secondary rounded-md px-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        const d = subMonths(parse(month, "yyyy-MM", new Date()), 1);
                        setMonth(format(d, "yyyy-MM"));
                      }}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs font-medium min-w-[90px] text-center">
                      {format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={month >= currentMonth()}
                      onClick={() => {
                        const d = addMonths(parse(month, "yyyy-MM", new Date()), 1);
                        setMonth(format(d, "yyyy-MM"));
                      }}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform ${configOpen ? "rotate-180" : ""}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {/* Brand cost inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {BRANDS.map((brand) => (
                  <div key={brand} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <BrandLogo brand={brand} size="sm" />
                      <span className="text-sm font-medium">{brand}</span>
                    </div>
                    {(["sales_cost", "tool_cost", "ad_spend"] as const).map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <Label className="text-xs w-24 text-muted-foreground">
                          {field === "sales_cost" ? "Sales Cost" : field === "tool_cost" ? "Tool Cost" : "Ad Spend"}
                        </Label>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            value={costs[brand][field] || ""}
                            onChange={(e) => updateCost(brand, field, Number(e.target.value) || 0)}
                            className="h-8 text-xs pl-5"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Service margin inputs */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Gross Margin % by Service Line</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {BRANDS.map((brand) => (
                    <div key={brand} className="space-y-2">
                      <span className="text-xs text-muted-foreground">{brand}</span>
                      {SERVICE_TYPES.map((svc) => (
                        <div key={svc} className="flex items-center gap-2">
                          <Label className="text-[11px] w-40 text-muted-foreground truncate">{svc}</Label>
                          <div className="relative w-20">
                            <Input
                              type="number"
                              value={costs[brand].margin_pct[svc] ?? ""}
                              onChange={(e) => updateMargin(brand, svc, Number(e.target.value) || 0)}
                              className="h-7 text-xs pr-5"
                              placeholder="0"
                              min={0}
                              max={100}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
                <Save className="h-3.5 w-3.5 mr-1" />
                {saving ? "Saving..." : "Save Cost Inputs"}
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* CAC & LTV Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BRANDS.map((brand) => {
          const m = metrics[brand];
          if (!m) return null;
          return (
            <Card key={brand}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BrandLogo brand={brand} size="sm" />
                  {brand} Unit Economics
                  <span className="text-[10px] text-muted-foreground ml-auto">{format(parse(month, "yyyy-MM", new Date()), "MMM yyyy")}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CAC Section */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    Customer Acquisition Cost
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-semibold">{fmt(m.totalCost)}</p>
                      <p className="text-[10px] text-muted-foreground">Monthly Cost</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{m.newCustomers}</p>
                      <p className="text-[10px] text-muted-foreground">New Customers</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {m.cac != null ? fmt(m.cac) : <span className="text-sm text-muted-foreground">No closes</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">CAC</p>
                    </div>
                  </div>
                </div>

                {/* LTV Section */}
                <div className="space-y-2 border-t border-border pt-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Lifetime Value
                  </div>
                  {m.avgContractMonths != null ? (
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-lg font-semibold">{fmt(m.avgSubscription)}</p>
                        <p className="text-[10px] text-muted-foreground">Avg MRR</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{m.avgContractMonths.toFixed(0)}mo</p>
                        <p className="text-[10px] text-muted-foreground">Avg Contract</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold">{m.ltv != null ? fmt(m.ltv) : "N/A"}</p>
                        <p className="text-[10px] text-muted-foreground">LTV</p>
                      </div>
                    </div>
                  ) : leads.filter(l => l.brand === brand && l.stage === "Closed Won").length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      No closed won deals yet for {brand}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Populate contract_start and contract_end on won deals to calculate LTV
                    </div>
                  )}
                </div>

                {/* LTV:CAC Ratio */}
                {m.ltvCacRatio != null && (
                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">LTV:CAC Ratio</span>
                    <span className={`text-lg font-bold ${ratioColor(m.ltvCacRatio)}`}>
                      {m.ltvCacRatio.toFixed(1)}x
                    </span>
                  </div>
                )}

                {/* Payback Period */}
                {m.cac != null && m.avgSubscription > 0 && (
                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">CAC Payback Period</span>
                    {(() => {
                      const months = m.cac / m.avgSubscription;
                      const color = months <= 3 ? "text-emerald-500" : months <= 12 ? "text-amber-500" : "text-red-500";
                      return (
                        <div className="text-right">
                          <span className={`text-lg font-bold ${color}`}>
                            {months < 1 ? `${(months * 30).toFixed(0)} days` : `${months.toFixed(1)} mo`}
                          </span>
                          {months < 3 && (
                            <p className="text-[10px] text-emerald-500">Excellent</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Gross Margin Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Gross Margin by Service Line
          </CardTitle>
        </CardHeader>
        <CardContent>
          {marginData.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No active deals with service lines assigned</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Brand</TableHead>
                  <TableHead className="text-xs">Service Line</TableHead>
                  <TableHead className="text-xs text-right">Deals</TableHead>
                  <TableHead className="text-xs text-right">Total Value</TableHead>
                  <TableHead className="text-xs text-right">Margin %</TableHead>
                  <TableHead className="text-xs text-right">Est. Gross Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {BRANDS.map((brand) => {
                  const brandRows = marginData.filter((r) => r.brand === brand);
                  if (brandRows.length === 0) return null;
                  const brandTotal = brandRows.reduce((s, r) => s + r.totalValue, 0);
                  const brandProfit = brandRows.reduce((s, r) => s + r.grossProfit, 0);
                  return (
                    <>{brandRows.map((r, i) => (
                      <TableRow key={`${brand}-${r.service}`}>
                        {i === 0 && (
                          <TableCell rowSpan={brandRows.length + 1} className="text-xs font-medium align-top">
                            <BrandLogo brand={brand} size="sm" />
                          </TableCell>
                        )}
                        <TableCell className="text-xs">{r.service}</TableCell>
                        <TableCell className="text-xs text-right">{r.dealCount}</TableCell>
                        <TableCell className="text-xs text-right">{fmt(r.totalValue)}</TableCell>
                        <TableCell className="text-xs text-right">
                          {r.marginPct > 0 ? `${r.marginPct}%` : <span className="text-muted-foreground">Set above</span>}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {r.marginPct > 0 ? fmt(r.grossProfit) : "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow key={`${brand}-subtotal`} className="bg-muted/30">
                      <TableCell className="text-xs font-medium" colSpan={2}>Subtotal</TableCell>
                      <TableCell className="text-xs text-right font-medium">{fmt(brandTotal)}</TableCell>
                      <TableCell className="text-xs text-right"></TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        {brandProfit > 0 ? fmt(brandProfit) : "\u2014"}
                      </TableCell>
                    </TableRow>
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Small inline icon to avoid importing Settings2 collision
function Settings2Icon({ className }: { className?: string }) {
  return <DollarSign className={className} />;
}
