// Container that switches between the index and a campaign detail.

import { useState } from "react";
import { SequencesIndex } from "./SequencesIndex";
import { CampaignDetail } from "./CampaignDetail";

export function SequencesView() {
  const [openId, setOpenId] = useState<string | null>(null);

  if (openId) return <CampaignDetail sequenceId={openId} onBack={() => setOpenId(null)} />;
  return <SequencesIndex onOpen={setOpenId} />;
}
