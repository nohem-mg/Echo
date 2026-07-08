/** Shared licensing domain constants and types for the escrow marketplace. */

export const LICENSE_LABELS = ["Sync", "Beat", "Full"] as const;

export const LICENSE_DESCRIPTIONS = [
  "Utilisation dans une synchronisation vidéo / film / pub.",
  "Droit d'utiliser la prod comme base instrumentale.",
  "Cession complète des droits d'utilisation.",
] as const;

export const DURATION_LABELS = ["1 an", "Perpétuel"] as const;

/** Tailwind classes tinting a license badge by type (0 Sync, 1 Beat, 2 Full). */
export function licenseColor(type: number): string {
  if (type === 2) return "text-[#f59abd] border-[#f59abd]/40 bg-[#f59abd]/10";
  if (type === 1) return "text-[#ffd166] border-[#ffd166]/40 bg-[#ffd166]/10";
  return "text-[#9ef7c9] border-[#9ef7c9]/40 bg-[#9ef7c9]/10";
}

export type Listing = {
  trackId: `0x${string}`;
  seller: `0x${string}`;
  price: bigint;
  licenseType: number;
  duration: number;
  active: boolean;
  sold: boolean;
  createdAt: bigint;
};

export type Purchase = {
  buyer: `0x${string}`;
  amount: bigint;
  confirmed: boolean;
  purchasedAt: bigint;
};
