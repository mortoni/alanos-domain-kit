import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * The append-only log of accepted and rejected actions, owned by the domain
 * (constitution CAP-3).
 *
 * One file, not a bucket per month: a record is a couple of hundred bytes.
 * Bucketing can come when there is a reason for it.
 *
 * It is committed, like evidence, because "the domain logged that it accepted
 * this" is worthless if it lives only on the machine that accepted it.
 */
export const AUDIT_LOG = join("audit", "actions.jsonl");

export interface AuditRecord {
  readonly at: string;
  readonly action: string;
  readonly requestId: string;
  readonly outcome: "accepted" | "rejected";
  /** The response the caller received, replayed verbatim on a repeat. */
  readonly result: Record<string, unknown>;
}

export async function readAuditLog(
  repositoryRoot: string,
): Promise<AuditRecord[]> {
  let raw: string;
  try {
    raw = await readFile(join(repositoryRoot, AUDIT_LOG), "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
  const records: AuditRecord[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    // A malformed line is skipped rather than thrown on: the log is evidence
    // of what happened, and one bad line must not make the rest unreadable.
    try {
      records.push(JSON.parse(line) as AuditRecord);
    } catch {
      continue;
    }
  }
  return records;
}

export async function appendAuditRecord(
  repositoryRoot: string,
  record: AuditRecord,
): Promise<void> {
  const path = join(repositoryRoot, AUDIT_LOG);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

/** The record for a request id already seen, if there is one. */
export const findByRequestId = (
  records: readonly AuditRecord[],
  action: string,
  requestId: string,
): AuditRecord | undefined =>
  records.find(
    (record) => record.action === action && record.requestId === requestId,
  );
