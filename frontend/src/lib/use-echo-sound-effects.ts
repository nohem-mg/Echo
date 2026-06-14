"use client";

import { useEffect, useRef } from "react";
import type { EchoFlow, EchoPipelineStep } from "@/lib/types";
import { echoSounds } from "@/lib/sound-design";

export function useEchoSoundEffects(
  flow: EchoFlow | null,
  livePipelineSteps: EchoPipelineStep[],
  pipelineStarted: boolean,
  hasRegistrySeal: boolean,
) {
  const prevFlowStatusRef = useRef<EchoFlow["status"] | undefined>(undefined);
  const prevStepsRef = useRef<EchoPipelineStep[]>([]);
  const prevSealRef = useRef(false);

  useEffect(() => {
    if (!pipelineStarted) {
      prevStepsRef.current = [];
      return;
    }

    const prevByKey = new Map(prevStepsRef.current.map((step) => [step.stepKey, step.status]));
    for (const step of livePipelineSteps) {
      const previousStatus = prevByKey.get(step.stepKey);
      if (
        previousStatus &&
        previousStatus !== "done" &&
        previousStatus !== "blocked" &&
        (step.status === "done" || step.status === "blocked")
      ) {
        echoSounds.stepComplete();
      }
    }

    prevStepsRef.current = livePipelineSteps;
  }, [livePipelineSteps, pipelineStarted]);

  useEffect(() => {
    const status = flow?.status;
    const prevStatus = prevFlowStatusRef.current;

    if (!status || status === prevStatus) {
      prevFlowStatusRef.current = status;
      return;
    }

    if (status === "pipeline_completed") {
      if (flow.report?.verdict === "CLEAN") {
        echoSounds.verdictClean();
      } else if (flow.report?.verdict === "REJECTED") {
        echoSounds.verdictRejected();
      } else {
        echoSounds.verdictSimilar();
      }
    } else if (status === "pipeline_blocked") {
      if (flow.report?.verdict === "REJECTED") {
        echoSounds.verdictRejected();
      } else {
        echoSounds.verdictSimilar();
      }
    } else if (status === "error") {
      echoSounds.verdictError();
    }

    prevFlowStatusRef.current = status;
  }, [flow?.status, flow?.report?.verdict]);

  useEffect(() => {
    if (hasRegistrySeal && !prevSealRef.current) {
      echoSounds.sealConfirmed();
    }
    prevSealRef.current = hasRegistrySeal;
  }, [hasRegistrySeal]);
}
