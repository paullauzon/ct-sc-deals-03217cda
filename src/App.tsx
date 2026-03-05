import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DealRoom from "./pages/DealRoom";
import NotFound from "./pages/NotFound";
import { LeadProvider } from "@/contexts/LeadContext";
import { ProcessingProvider } from "@/contexts/ProcessingContext";

const queryClient = new QueryClient();

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
              <Route path="/deal/:id" element={<DealRoom />} />
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
