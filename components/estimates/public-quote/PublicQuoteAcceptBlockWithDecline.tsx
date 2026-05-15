"use client";

import { useState } from "react";
import { DeclineModal } from "./DeclineModal";
import { PublicQuoteAcceptBlock } from "./PublicQuoteAcceptBlock";

interface Props {
  token: string;
  customerEmail: string | null;
}

export function PublicQuoteAcceptBlockWithDecline({
  token,
  customerEmail,
}: Props) {
  const [declineOpen, setDeclineOpen] = useState(false);
  return (
    <>
      <PublicQuoteAcceptBlock
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
