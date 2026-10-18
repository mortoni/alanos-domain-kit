import {
  DOMAIN_CONTRACT_VERSION,
  DOMAIN_ID,
  MANIFEST_VERSION,
} from "../domain/contract.js";

/** The domain status standard's response shape (constitution STA-1 to STA-3). */
export interface DomainStatus {
  readonly domain: string;
  readonly status: "ok" | "degraded";
  readonly contractVersion: string;
  readonly manifestVersion: number;
  readonly lastKnowledgeUpdate: string | null;
  readonly detail: string | null;
}

export function domainStatus(): DomainStatus {
  return {
    domain: DOMAIN_ID,
    status: "ok",
    contractVersion: DOMAIN_CONTRACT_VERSION,
    manifestVersion: MANIFEST_VERSION,
    lastKnowledgeUpdate: null,
    detail: null,
  };
}
