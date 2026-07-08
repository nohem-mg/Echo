"use client";

import { Check } from "@phosphor-icons/react";
import { CircleDot, Waves } from "lucide-react";
import { getLiveStepState, type DisplayStep, type StepState } from "@/lib/flow/pipeline-display";

const STEP_STATUS = {
  idle: { label: "Waiting", className: "text-white/35", icon: CircleDot },
  active: { label: "Running", className: "text-[#fff7cf]", icon: Waves },
  done: { label: "Done", className: "text-[#9ef7c9]", icon: Check },
  blocked: { label: "Stopped", className: "text-[#ff7777]", icon: CircleDot },
} as const;

function PipelineRow({ step, state }: { step: DisplayStep; state: StepState }) {
  const status = STEP_STATUS[state];
  const Icon = status.icon;

  return (
    <div className="grid min-h-20 grid-cols-[58px_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0">
      <span className="font-display text-2xl font-black text-white/45">{step.id}</span>
      <span>
        <span className="block font-bold">{step.title}</span>
        <span className="block text-sm text-white/45">{step.detail}</span>
      </span>
      <span className={`flex items-center gap-2 text-sm font-bold ${status.className}`}>
        <Icon className="size-4" aria-hidden="true" />
        {state === "done" ? step.meta : status.label}
      </span>
    </div>
  );
}

type PipelineStepListProps = {
  steps: DisplayStep[];
  hasLiveSteps: boolean;
  pipelineStarted: boolean;
};

export function PipelineStepList({ steps, hasLiveSteps, pipelineStarted }: PipelineStepListProps) {
  return (
    <div className="mt-6 rounded-[8px] border border-white/10 bg-black/40">
      {steps.map((step) => {
        const state: StepState = hasLiveSteps
          ? getLiveStepState(step.status)
          : pipelineStarted ? "active" : "idle";
        return <PipelineRow key={step.id} step={step} state={state} />;
      })}
    </div>
  );
}
