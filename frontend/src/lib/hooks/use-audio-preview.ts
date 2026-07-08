import { useEffect, useRef, useState } from "react";
import { echoSounds } from "@/lib/sound-design";

/**
 * Owns the hidden `<audio>` element used to preview the uploaded track:
 * object-URL lifecycle, play/pause state sync, and preview sound cues.
 * Render the returned ref on an `<audio>` element.
 */
export function useAudioPreview(file: File | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const syncPlaying = () => setIsPlaying(!audio.paused && !audio.ended);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("play", syncPlaying);
    audio.addEventListener("pause", syncPlaying);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", syncPlaying);
      audio.removeEventListener("pause", syncPlaying);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    audio?.pause();

    if (!file) {
      if (audio) {
        audio.removeAttribute("src");
        audio.load();
      }
      return;
    }

    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    if (audio) {
      audio.src = url;
      audio.load();
    }

    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [file]);

  async function togglePreview() {
    const audio = audioRef.current;
    if (!audio || !file) {
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        echoSounds.previewPlay();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audio.pause();
    echoSounds.previewPause();
  }

  return { audioRef, isPlaying, togglePreview };
}
