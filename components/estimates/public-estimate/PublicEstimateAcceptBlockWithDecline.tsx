"use client";

import { useState } from "react";
import { DeclineModal } from "./DeclineModal";
import { PublicEstimateAcceptBlock } from "./PublicEstimateAcceptBlock";

interface Props {
  token: string;
  customerEmail: string | null;
}

export function PublicEstimateAcceptBlockWithDecline({
  token,
  customerEmail,
}: Props) {
  const [declineOpen, setDeclineOpen] = useState(false);
  return (
    <>
      <PublicEstimateAcceptBlock
        token={token}
        customerEmail={customerEmail}
        onDeclineClick={() => setDeclineOpen(true)}
      />
      <DeclineModal
        token={token}
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
      />
    </>
  );
}
