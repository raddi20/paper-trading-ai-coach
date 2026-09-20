import { Suspense } from "react";
import { MarketsView } from "@/components/MarketsView";

export default function MarketsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading markets…</p>}>
      <MarketsView />
    </Suspense>
  );
}
