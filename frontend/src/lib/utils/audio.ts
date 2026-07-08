export async function createAudioFingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hash}`;
}

export function stripAudioExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "") || "Echo sealed track";
}
