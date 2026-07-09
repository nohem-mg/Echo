/** Abbreviates a long hex string as `0x123456…abcdef` for compact display. */
export function shortHex(hex: string): string {
  return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
}
