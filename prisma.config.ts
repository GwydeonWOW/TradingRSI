import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrate: {
    async url() {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL environment variable is not set");
      return url;
    },
  },
});
