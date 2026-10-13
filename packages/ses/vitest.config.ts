import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // @posta/core reaches @posta/config through @posta/db;
    // validation would demand a full production env at import.
    env: { SKIP_ENV_VALIDATION: "1" },
  },
});
