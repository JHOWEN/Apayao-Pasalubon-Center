import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const prismaCli = resolve(process.cwd(), "node_modules/prisma/build/index.js");
const generationOnlyUrl =
  "postgresql://generate:unused@127.0.0.1:5432/generate";

// Prisma needs datasource URLs to parse the schema, but client generation does
// not connect to the database. Never expose the migration URL to this process.
execFileSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: generationOnlyUrl,
    DIRECT_URL: generationOnlyUrl,
  },
});
