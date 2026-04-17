import { useEffect, useState } from "react";
import { ClientAccountProvider } from "@/contexts/ClientAccountContext";
import { ClientPipeline } from "@/components/ClientPipeline";

function readAccountFromHash(): string | null {
  const hash = window.location.hash.replace("#", "");
  const params = new URLSearchParams(hash);
  return params.get("account");
}

export function ClientSuccessSystem() {
  const [initialAccountId, setInitialAccountId] = useState<string | null>(() => readAccountFromHash());

  useEffect(() => {
    const onHashChange = () => setInitialAccountId(readAccountFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const clearAccountHash = () => {
    const hash = window.location.hash.replace("#", "");
    const params = new URLSearchParams(hash);
    if (params.has("account")) {
      params.delete("account");
      window.location.hash = params.toString();
    }
    setInitialAccountId(null);
  };

  return (
    <ClientAccountProvider>
      <ClientPipeline initialAccountId={initialAccountId} onClearInitial={clearAccountHash} />
    </ClientAccountProvider>
  );
}
