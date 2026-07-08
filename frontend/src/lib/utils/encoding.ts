import { toHex } from "viem";

export function toBytes32Hex(value: string): `0x${string}` {
  let hexValue = value;

  if (hexValue.startsWith("sha256:")) {
    hexValue = `0x${hexValue.slice(7)}`;
  } else if (!hexValue.startsWith("0x")) {
    hexValue = toHex(hexValue);
  }

  return hexValue.padEnd(66, "0").slice(0, 66) as `0x${string}`;
}
