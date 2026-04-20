import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams, useNavigate, Navigate } from "react-router-dom";
import { ReactNode } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/Auth";
import ProfilePage from "./pages/Profile";
import TeamPage from "./pages/Team";
import { LeadProvider } from "@/contexts/LeadContext";
import { ProcessingProvider } from "@/contexts/ProcessingContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LeadDetailPanel } from "@/components/LeadDetailPanel";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

function SessionGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

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
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <SessionGuard>
                  <LeadProvider>
                    <ProcessingProvider>
                      <Index />
                    </ProcessingProvider>
                  </LeadProvider>
                </SessionGuard>
              }
            />
            <Route
              path="/deal/:id"
              element={
                <SessionGuard>
                  <LeadProvider>
                    <ProcessingProvider>
                      <LeadDetailRoute />
                    </ProcessingProvider>
                  </LeadProvider>
                </SessionGuard>
              }
            />
            <Route
              path="/profile"
              element={
                <SessionGuard>
                  <ProfilePage />
                </SessionGuard>
              }
            />
            <Route
              path="/settings/team"
              element={
                <SessionGuard>
                  <TeamPage />
                </SessionGuard>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
