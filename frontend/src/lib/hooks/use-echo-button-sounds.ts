"use client";

import { useEffect } from "react";
import { echoSounds } from "@/lib/sound-design";

const INTERACTIVE_SELECTOR = "button, [role='button']";

function isInteractiveControl(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(INTERACTIVE_SELECTOR);
}

function shouldPlayButtonSound(control: HTMLElement): boolean {
  if (
    control.hasAttribute("data-echo-silent") ||
    control.closest("[data-echo-silent]") ||
    control.hasAttribute("disabled") ||
    control.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  return !echoSounds.isMuted();
}

export function useEchoButtonSounds() {
  useEffect(() => {
    echoSounds.installAudioUnlockListeners();

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) {
        return;
      }

      const control = event.target.closest(INTERACTIVE_SELECTOR);
      if (!control || !isInteractiveControl(control) || !shouldPlayButtonSound(control)) {
        return;
      }

      echoSounds.uiClickFromUserGesture();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);
}
