import { Suspense } from "react";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading coach…</p>}>
      <CoachChat />
    </Suspense>
  );
}
