/**
 * Committing what this domain writes (constitution EV-14). The engine is
 * @alanos/domain-kit's; what is this domain's is the paths it owns.
 */
import { createDomainGit } from "@alanos/domain-kit";
import { DOMAIN_ID } from "../domain/contract.js";

/** Everything this domain writes. Code is never among it. */
export const DOMAIN_OWNED = [
  "evidence",
  "knowledge",
  "audit",
  "insights",
] as const;

const domainGit = createDomainGit({
  domainId: DOMAIN_ID,
  ownedPaths: DOMAIN_OWNED,
  defaultOwner: "__OWNER__",
});

export const {
  commitPaths,
  commitDomainOwned,
  uncommitted,
  hasRemote,
  listChanges,
  commitPending,
} = domainGit;
