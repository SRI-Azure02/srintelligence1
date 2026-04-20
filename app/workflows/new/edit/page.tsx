"use client";

/**
 * /workflows/new/edit
 *
 * Creates a blank WorkflowCard in localStorage, then immediately redirects to
 * the proper /workflows/[id]/edit page so there is a single canonical canvas
 * implementation.  Shows a neutral loading state while this happens.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveWorkflow } from "@/lib/workflow-storage";
import type { WorkflowCard } from "@/lib/types";

export default function NewWorkflowBootstrap() {
  const router = useRouter();

  useEffect(() => {
    const id = `wf-${Date.now()}`;
    const blank: WorkflowCard = {
      id,
      name:        "New Workflow",
      description: "",
      agentChain:  [],
      schedule:    "manual",
      lastRun:     "Never",
      status:      "success",
      runCount:    0,
    };
    saveWorkflow(blank);
    router.replace(`/workflows/${id}/edit`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex h-full items-center justify-center"
      style={{ background: "#ffffff" }}
    >
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        Creating workflow…
      </span>
    </div>
  );
}
