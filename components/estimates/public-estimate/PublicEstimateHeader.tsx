"use client";

import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { DownloadSimpleIcon } from "@/components/ui/icons";

interface Props {
  /** Left side of the bar: the document's status. */
  children?: ReactNode;
}

/**
 * The slim bar above the public document: the SqFt mark and the PDF action on
 * one line, the document's status under it.
 */
export function PublicEstimateHeader({ children }: Props) {
  return (
    <div className="mb-3 sm:mb-4 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <BrandMark size="sm" />
        <Button
          type="button"
          variant="default"
          size="sm"
          className="bg-[var(--paper)]"
          onClick={() => window.print()}
        >
          <DownloadSimpleIcon aria-hidden="true" />
          Download PDF
        </Button>
      </div>
      {children ? <div className="min-w-0 mt-4">{children}</div> : null}
    </div>
  );
}
