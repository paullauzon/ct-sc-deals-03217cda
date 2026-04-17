import { ClientAccountProvider } from "@/contexts/ClientAccountContext";
import { ClientPipeline } from "@/components/ClientPipeline";

export function ClientSuccessSystem() {
  return (
    <ClientAccountProvider>
      <ClientPipeline />
    </ClientAccountProvider>
  );
}
