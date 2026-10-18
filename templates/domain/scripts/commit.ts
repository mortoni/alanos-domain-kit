/** `pnpm commit`: commit what this domain wrote and has not committed (constitution EV-14). Never code, never a push. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitDomainOwned } from "../src/application/git-commit.js";
import { DOMAIN_ID } from "../src/domain/contract.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outcome = await commitDomainOwned(
  root,
  `${DOMAIN_ID}: commit what the domain wrote\n\nWhat it wrote and left uncommitted (constitution EV-14).`,
);
if (outcome.committed) console.log(`committed ${outcome.commit}`);
else {
  console.log(`not committed: ${outcome.reason}`);
  if (outcome.reason !== "nothing to commit") process.exit(1);
}
