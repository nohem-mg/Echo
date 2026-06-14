import { createAgentkitClient } from "@worldcoin/agentkit";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

async function runTest() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  console.log("Agent:", account.address);

  // Signer avec type et chainId explicites — c'est ce que selectSupportedChain compare
  const agentkit = createAgentkitClient({
    signer: {
      address: account.address,
      chainId: "eip155:480",  // doit matcher EXACTEMENT supportedChains[0].chainId
      type: "eip191",          // doit matcher EXACTEMENT supportedChains[0].type
      signMessage: async (message: string) => account.signMessage({ message }),
    },
    onEvent: (event) => console.log("AgentKit Event:", event),
  });

  const payload = {
    audioFile: "arpeggio.wav",
    midiSequence: JSON.stringify({ notes: [], duration_s: 0, n_notes: 0 }),
    registry_matches: [],
    commercial_deltas: [{
      ISRC: "USRC12345",
      title: "Blinding Lights - The Weeknd",
      melodic: 72,
      rhythmic: 81,
      structural: 55,
      soundcloud_url: "https://soundcloud.com/theweeknd/blinding-lights"
    }]
  };

  console.log("=== Test createAgentkitClient automatique ===");

  for (let i = 1; i <= 4; i++) {
    console.log(`\n▶️ Requête N°${i}...`);
    try {
      // agentkit.fetch gère automatiquement : requête → 402 → sign → retry
      const response = await agentkit.fetch("http://localhost:8080/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        console.log(`✅ Succès ! Status: ${response.status}`);
        console.log(`📝 ai_summary: ${data?.ai_summary?.slice(0, 150)}...`);
      } else if (response.status === 402) {
        console.log(`❌ 402 — Trial épuisé`);
      } else {
        console.log(`⚠️ Erreur ${response.status}:`, data);
      }
    } catch (err) {
      console.error("Erreur:", err);
    }
  }
}

runTest();
