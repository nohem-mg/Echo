import { describe, expect } from "bun:test";
import { test } from "@chainlink/cre-sdk/test";
import { initWorkflow } from "./main";
import type { Config } from "./main";

describe("initWorkflow", () => {
  test("registers a single handler on the HTTP trigger", async () => {
    const config: Config = { backendBaseUrl: "http://localhost:8080" };

    const handlers = initWorkflow(config);

    expect(handlers).toBeArray();
    expect(handlers).toHaveLength(1);
  });
});
