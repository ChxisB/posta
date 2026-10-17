import { describe, expect, it } from "vitest";
import { assertEnvConsistency, type Env, regionStacks, servedRegions } from "../src/env.js";

const withEnv = (e: Partial<Record<"AWS_REGION" | "AWS_REGIONS", unknown>>) => e as unknown as Env;

it("lists AWS_REGIONS in order, the first being the default", () => {
  expect(servedRegions(withEnv({ AWS_REGIONS: ["sa-east-1", "us-east-1"] }))).toEqual([
    "sa-east-1",
    "us-east-1",
  ]);
  // Under SKIP_ENV_VALIDATION the proxy carries the raw string.
  expect(servedRegions(withEnv({ AWS_REGIONS: " sa-east-1 ,us-east-1, " }))).toEqual([
    "sa-east-1",
    "us-east-1",
  ]);
});

it("falls back to the one-region alias, then to the built-in default", () => {
  expect(servedRegions(withEnv({ AWS_REGION: "eu-west-1" }))).toEqual(["eu-west-1"]);
  expect(servedRegions(withEnv({ AWS_REGIONS: "", AWS_REGION: "eu-west-1" }))).toEqual([
    "eu-west-1",
  ]);
  expect(servedRegions(withEnv({}))).toEqual(["us-east-1"]);
});

describe("regionStacks", () => {
  const stacks = (REGION_STACKS?: string, AWS_REGION?: string) =>
    ({ REGION_STACKS, AWS_REGION }) as unknown as Env;

  it("is empty when unset and reduces each URL to its origin", () => {
    expect(regionStacks(stacks())).toEqual([]);
    expect(
      regionStacks(
        stacks(" eu-west-2=https://eu.example.com/signup , us-east-1=http://localhost:3000"),
      ),
    ).toEqual([
      { region: "eu-west-2", url: "https://eu.example.com" },
      { region: "us-east-1", url: "http://localhost:3000" },
    ]);
  });

  it("refuses a pair without a region or a web URL", () => {
    for (const bad of [
      "eu-west-2",
      "=https://eu.example.com",
      "eu-west-2=eu.example.com",
      "eu-west-2=ftp://x.test",
    ]) {
      expect(() => regionStacks(stacks(bad))).toThrow(/REGION_STACKS entry/);
    }
  });

  it("must list the stack's own region at boot", () => {
    const e = (list: string) =>
      ({
        ...stacks(list, "eu-west-2"),
        IS_CLOUD: false,
        MASTER_ENCRYPTION_KEY: "key",
      }) as unknown as Env;
    expect(() => assertEnvConsistency(e("eu-west-2=https://eu.example.com"))).not.toThrow();
    expect(() => assertEnvConsistency(e("us-east-1=https://us.example.com"))).toThrow(
      /own region, eu-west-2/,
    );
  });
});
