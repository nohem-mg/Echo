import { describe, expect, test } from "bun:test";
import { extractTxHash, pickForwarderTransactionHash } from "./evm-callback";

const FORWARDER = "0x15fc6ae953e024d975e77382eeec56a9101f9f88";
const SENDER = "0x4CAEAbD5a1a25e4233c28b5ce533fbce583bb1d93fd430e4c4a06563c2f355f8";

const HASH = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

describe("extractTxHash", () => {
  test("reads txHash hex string", () => {
    expect(extractTxHash({ txHash: HASH })).toBe(HASH);
  });

  test("reads tx_hash snake_case hex string", () => {
    expect(extractTxHash({ tx_hash: HASH.slice(2) })).toBe(HASH);
  });

  test("reads txHash Uint8Array from WriteReportReply", () => {
    const bytes = Uint8Array.from(Buffer.from(HASH.slice(2), "hex"));
    expect(extractTxHash({ txStatus: 2, txHash: bytes })).toBe(HASH);
  });

  test("finds nested transactionHash", () => {
    expect(extractTxHash({ receipt: { transactionHash: HASH } })).toBe(HASH);
  });

  test("returns undefined when hash is missing", () => {
    expect(extractTxHash({ txStatus: "TX_STATUS_SUCCESS" })).toBeUndefined();
  });
});

describe("pickForwarderTransactionHash", () => {
  test("returns the latest matching forwarder tx", () => {
    const hash = pickForwarderTransactionHash(
      [
        {
          transactions: [{ hash: HASH, to: FORWARDER, from: SENDER }],
        },
      ],
      FORWARDER,
      SENDER,
    );
    expect(hash).toBe(HASH);
  });

  test("ignores txs from other senders when a wallet filter is set", () => {
    const hash = pickForwarderTransactionHash(
      [
        {
          transactions: [{ hash: HASH, to: FORWARDER, from: "0x0000000000000000000000000000000000000001" }],
        },
      ],
      FORWARDER,
      SENDER,
    );
    expect(hash).toBeUndefined();
  });
});
