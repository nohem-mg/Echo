# Echo — Ephemeral Owner Key: how it stays private *and* recoverable

## The tension

For privacy, the on-chain `owner` of a track must **not** be the artist's real wallet — otherwise the
registry publicly links "this person registered/sold this song." So we use an **ephemeral owner key**:
a fresh keypair whose address is what appears on-chain.

But "ephemeral" usually means "throwaway," which raises the obvious objection:

> *If it's a throwaway key, how does the artist prove ownership later (to reveal, or to sell a license)?
> If they lose it, they lose the song.*

The answer: the key is **ephemeral in appearance, deterministic in derivation.** It is never random and
never stored — it is **re-derived on demand** from the artist's real wallet. Publicly unlinkable;
privately reproducible.

---

## How it works — deterministic derivation from a wallet signature

The artist's real wallet signs **one fixed, domain-separated message**. We hash that signature into a
private key. Because Ethereum signing is deterministic (RFC 6979 — the same key signing the same message
always yields the same signature), the artist can reproduce the exact same owner key any time, on any
device, just by reconnecting their wallet and signing the same message again.

```ts
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';

// 1. Artist signs a FIXED, domain-separated message with their real wallet (MetaMask, etc.).
//    Including the commitmentHash makes the key PER-TRACK (see "Per-track vs single key").
const message =
  `Echo owner key v1 | app:echo | chain:11155111 | track:${commitmentHash}`;
const signature = await walletClient.signMessage({ account: realWallet, message });

// 2. Hash the signature → a deterministic 32-byte secp256k1 private key.
const ownerPrivateKey = keccak256(signature);

// 3. The owner account. ITS ADDRESS is what goes on-chain as `owner`.
const ownerAccount = privateKeyToAccount(ownerPrivateKey);
const ownerAddress = ownerAccount.address;
```

**Re-derivation later** (to reveal a track or sign a license sale): same wallet + same message →
same `signature` → same `ownerPrivateKey` → same `ownerAddress`. Nothing was stored; it is reconstituted.

```ts
// Months later, to authorize revealTrack / a sale:
const sameKey = keccak256(await walletClient.signMessage({ account: realWallet, message }));
const ownerAccount = privateKeyToAccount(sameKey);
const sig = await ownerAccount.signMessage({ message: { raw: digest } }); // proves ownership
```

---

## Why this is private

- `ownerAddress` is `address(keccak256(signature))` — a hash of a secret signature. On-chain it looks like
  a brand-new, unrelated address. **You cannot walk from `ownerAddress` back to the artist's real wallet**
  without the signature, and only the artist's wallet can produce that signature.
- So the link "real artist ⇄ owner key" exists **only inside the artist's wallet**, never on-chain.
  Publicly unlinkable; provable on demand by the owner.

## Per-track vs single key

| | Message | Effect |
|---|---|---|
| **Single key** | `Echo owner key v1` | One owner address for all the artist's tracks. Simpler, but their tracks become correlatable *to each other* (same owner), though still not to their identity. |
| **Per-track key** (recommended) | `Echo owner key v1 \| track:${commitmentHash}` | A different owner address per track. Tracks are not correlatable to each other. Costs one extra signature per track and requires the `commitmentHash` to re-derive (recomputable from the track's fingerprint+profile, or store the track list). |

---

## Security notes (say these in the pitch)

- **Determinism source:** standard software wallets sign via RFC 6979 (deterministic ECDSA), so
  `personal_sign` is reproducible. ⚠️ Some hardware wallets / exotic signers may not guarantee this — for
  those, fall back to deriving once and storing the key **encrypted** (e.g. under a passphrase) as backup.
- **The signature IS the seed.** Derive it in memory and discard it; never persist or transmit the raw
  signature. If it leaks, the owner key is compromised.
- **Domain separation:** the message embeds app + chain + version so the same signature can't be replayed
  to derive a key in another app or collide across deployments.
- **Backup = the master wallet.** Lose access to the real wallet → can't re-derive → can't reveal/sell.
  The artist's existing wallet custody *is* the recovery story (no new secret to back up).

---

## The Unlink alignment (strong pitch point)

This is **the exact mechanism Unlink itself uses.** Per Unlink's docs, an Unlink account is derived from
an EOA `personal_sign` over a standardized message embedding `appId` + `chainId`, then expanded with
HKDF-SHA256 into the account seed. So:

- Our owner key uses the **same proven, audited pattern** Unlink relies on for its private accounts.
- We can even make the owner key **be** the artist's Unlink account — one pseudonymous identity that is
  both the on-chain track owner *and* the private payment account, with no extra key to manage.

One sentence for the pitch: *"The artist's ownership is a deterministic key derived from a wallet
signature — unlinkable on-chain, never stored, and re-derivable anytime from the same wallet. It's the
same derivation model Unlink uses for private accounts, so it composes natively with private settlement."*
