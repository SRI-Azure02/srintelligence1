"use client";

import ReportsPanel from "@/src/components/reports/ReportsPanel";

export default function ReportsPage() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <ReportsPanel userId="current-user" />
      </div>
    </div>
  );
}
