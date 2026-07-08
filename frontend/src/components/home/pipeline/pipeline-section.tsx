"use client";

import { getLiveStepState, type DisplayStep } from "@/lib/flow/pipeline-display";

export function PipelineSection({ steps }: { steps: DisplayStep[] }) {
  return (
    <section id="pipeline" className="px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <div className="mx-auto flex flex-col gap-6 lg:gap-8 w-full max-w-7xl">
        <div>
          <p className="echo-hand-float font-hand text-2xl sm:text-3xl text-[#9ef7c9]" style={{ animationDelay: "0.6s" }}>
            echo, but sealed
          </p>
          <h2 className="mt-2 sm:mt-4 max-w-3xl font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-black leading-[0.9]">
            One private run. One public timestamp.
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {steps.map((step) => {
            const liveState = getLiveStepState(step.status);
            const progressWidth = step.meta && step.meta.endsWith("%")
              ? step.meta
              : liveState === "done"
                ? "100%"
                : liveState === "active"
                  ? "50%"
                  : "10%";
            const borderClass = liveState === "blocked"
              ? "border-[#ff7777]/40 bg-[#ff7777]/5"
              : liveState === "active"
                ? "border-[#fff7cf]/40 bg-[#fff7cf]/5"
                : "border-white/15 bg-[#080808]";
            return (
              <div className={`min-h-48 sm:min-h-56 lg:min-h-[170px] xl:min-h-[200px] rounded-[8px] border p-4 sm:p-5 transition-colors duration-200 ${borderClass}`} key={step.id}>
                <div className="mb-4 sm:mb-8 lg:mb-3 xl:mb-6 flex items-start justify-between gap-2">
                  <span className={`font-display text-4xl sm:text-5xl lg:text-3xl xl:text-4xl font-black ${liveState === "blocked" ? "text-[#ff7777]" : "text-[#f59abd]"}`}>{step.id}</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-sm text-white/55">
                    {step.id === "02A" || step.id === "02B" ? "Parallel" : "Sequential"}
                  </span>
                </div>
                <h3 className="font-display text-lg sm:text-2xl lg:text-base xl:text-lg font-black truncate lg:whitespace-normal">{step.title}</h3>
                <p className="mt-1 sm:mt-2 text-sm sm:text-lg lg:text-xs xl:text-sm text-white/55 line-clamp-2 lg:line-clamp-none">{step.detail}</p>
                {step.reason && (
                  <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#ff7777] font-semibold line-clamp-2">{step.reason}</p>
                )}
                <div className="mt-4 sm:mt-8 lg:mt-3 xl:mt-5 h-2 rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${liveState === "blocked" ? "bg-[#ff7777]" : liveState === "active" ? "echo-progress-shimmer" : "bg-[#9ef7c9]"}`}
                    style={{ width: progressWidth }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
