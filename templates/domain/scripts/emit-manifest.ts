/**
 * Emit domain-manifest.json from the running tool registry (constitution
 * MAN-2). `--check` fails if the committed manifest is not what the code
 * would emit. The engine is @alanos/domain-kit's; the body is this domain's.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ManifestProblem, emitManifest } from "@alanos/domain-kit";
import {
  DOMAIN_CONTRACT_VERSION,
  DOMAIN_ID,
  MANIFEST_VERSION,
} from "../src/domain/contract.js";
import {
  IMPROVEMENT_BRIEF_PATH,
  IMPROVEMENT_WATCH,
  INSIGHTS_THRESHOLD,
} from "../src/domain/improvement.js";
import { MCP_TOOLS } from "../src/mcp/tools.js";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const body = {
  manifestVersion: MANIFEST_VERSION,
  domain: DOMAIN_ID,
  contractVersion: DOMAIN_CONTRACT_VERSION,
  description: __DESCRIPTION_JSON__,
  repository: "__REPOSITORY__",
  rawEvidence: "none",
  knowledge: "authored",
  visibility: {
    default: "__VISIBILITY__",
    surfaces: { mcpLocal: "__VISIBILITY__" },
  },
  entityTypes: ["__ENTITY__"],
};

try {
  const result = await emitManifest({
    repositoryRoot,
    body,
    tools: MCP_TOOLS,
    improvement: {
      brief: IMPROVEMENT_BRIEF_PATH,
      threshold: INSIGHTS_THRESHOLD,
      watch: [...IMPROVEMENT_WATCH],
    },
    checkOnly,
  });
  if (checkOnly && result.stale) {
    console.error(
      "domain-manifest.json is stale; run pnpm emit:manifest and commit the result",
    );
    process.exit(1);
  }
  console.log(
    `${checkOnly ? "domain-manifest.json is current" : "wrote domain-manifest.json"}: ${result.reads} reads, ${result.actions} actions`,
  );
} catch (error) {
  if (error instanceof ManifestProblem) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
