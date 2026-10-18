/** What this domain publishes about itself. One place, so nothing drifts. */
export const DOMAIN_ID = "__ID__" as const;
export const MANIFEST_VERSION = 1 as const;

/** The Alan OS constitution version this domain declares as its floor (VER-2). */
export const DOMAIN_CONTRACT_VERSION = "__FLOOR__" as const;

export const SERVER_VERSION = "0.1.0" as const;

/**
 * An id as a caller may hand it back (constitution EV-S3). This domain
 * publishes `__ID__:<id>`; it accepts that and the bare id.
 */
export const bareId = (id: string): string =>
  id.startsWith(`${DOMAIN_ID}:`) ? id.slice(DOMAIN_ID.length + 1) : id;

export const citeAs = (id: string): string => `${DOMAIN_ID}:${id}`;
