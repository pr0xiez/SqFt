import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPublicBaseUrl } from "@/lib/baseUrl";

const SAVED = {
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};

beforeEach(() => {
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
});

afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("getPublicBaseUrl", () => {
  it("prefers PUBLIC_BASE_URL when set, regardless of Vercel env", () => {
    process.env.PUBLIC_BASE_URL = "https://sqft.dev";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "fallback.vercel.app";
    process.env.VERCEL_URL = "deploy-abc.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://sqft.dev");
  });

  it("strips trailing slashes from PUBLIC_BASE_URL", () => {
    process.env.PUBLIC_BASE_URL = "https://sqft.dev/";
    expect(getPublicBaseUrl()).toBe("https://sqft.dev");
  });

  it("on a preview deployment, links to the preview itself", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "sqft.dev";
    process.env.VERCEL_URL = "sqft-git-feat-pr0xiez.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://sqft-git-feat-pr0xiez.vercel.app");
  });

  it("on a production deployment, links to the stable production hostname", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "sqft.dev";
    process.env.VERCEL_URL = "sqft-abc-pr0xiez.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://sqft.dev");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when VERCEL_ENV is unset", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "sqft.dev";
    process.env.VERCEL_URL = "deploy-abc.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://sqft.dev");
  });

  it("falls back to VERCEL_URL when neither VERCEL_ENV nor production URL is set", () => {
    process.env.VERCEL_URL = "sqft-abc.vercel.app";
    expect(getPublicBaseUrl()).toBe("https://sqft-abc.vercel.app");
  });

  it("falls back to localhost when no env vars are set", () => {
    expect(getPublicBaseUrl()).toBe("http://localhost:3000");
  });
});
