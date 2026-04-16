import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { LeadProvider } from "@/contexts/LeadContext";
import { ProcessingProvider } from "@/contexts/ProcessingContext";
import { LeadDetailPanel } from "@/components/LeadDetailPanel";

const queryClient = new QueryClient();

function LeadDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <LeadDetailPanel
      leadId={id ?? null}
      open
      mode="page"
      onClose={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate("/");
      }}
    />
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <LeadProvider>
          <ProcessingProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/deal/:id" element={<LeadDetailRoute />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ProcessingProvider>
        </LeadProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
