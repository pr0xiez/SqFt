"use client";

import { useState } from "react";
import { DeclineModal } from "./DeclineModal";
import { PublicEstimateAcceptBlock } from "./PublicEstimateAcceptBlock";

interface Props {
  token: string;
}

export function PublicEstimateAcceptBlockWithDecline({ token }: Props) {
  const [declineOpen, setDeclineOpen] = useState(false);
  return (
    <>
      <PublicEstimateAcceptBlock
        token={token}
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
