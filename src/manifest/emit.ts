/**
 * The manifest emitter engine (constitution MAN-2). Capabilities are derived
 * from the running tool registry, never copied beside it, so the published
 * contract cannot disagree with the server. `--check` fails when the
 * committed manifest is not what the code would emit.
 *
 * The manifest body is the domain's own and arrives as a parameter; this
 * engine owns only the mechanics.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The slice of a tool the manifest declares. */
export interface ManifestToolLike {
  readonly name: string;
  readonly kind: "read" | "action";
  readonly description: string;
  readonly withheldFromModels?: true;
}

export interface EmitManifestOptions {
  readonly repositoryRoot: string;
  /**
   * Everything the domain says about itself, in the order it wants it
   * published: manifestVersion, domain, contractVersion, description,
   * repository, rawEvidence, visibility, entityTypes, schemaVersions and the
   * rest. The engine appends capabilities, interfaces and improvement.
   */
  readonly body: Record<string, unknown>;
  readonly tools: readonly ManifestToolLike[];
  /**
   * Capabilities the domain declares beyond the running registry, appended
   * after the derived ones: planned capabilities have no implementation to
   * derive a description from, so the domain writes these entries by hand
   * and they are published verbatim.
   */
  readonly planned?: {
    readonly read?: readonly Record<string, unknown>[];
    readonly action?: readonly Record<string, unknown>[];
  };
  /** Default: one local stdio surface, current, no auth. */
  readonly interfaces?: Record<string, unknown>;
  readonly improvement: {
    readonly brief: string;
    readonly threshold: number;
    readonly watch: readonly string[];
  };
  readonly checkOnly: boolean;
  readonly manifestFileName?: string;
}

/** A structural problem the domain must fix; the caller prints and exits. */
export class ManifestProblem extends Error {}

export interface EmitManifestResult {
  readonly reads: number;
  readonly actions: number;
  /** True when checkOnly found the committed manifest is not current. */
  readonly stale: boolean;
  readonly manifestPath: string;
}

export async function emitManifest(
  options: EmitManifestOptions,
): Promise<EmitManifestResult> {
  const manifestPath = join(
    options.repositoryRoot,
    options.manifestFileName ?? "domain-manifest.json",
  );

  const declare = (tool: ManifestToolLike) => {
    if (tool.description.trim() === "") {
      throw new ManifestProblem(`MCP tool ${tool.name} has no description.`);
    }
    return {
      name: tool.name,
      status: "current",
      interfaces: ["mcpLocal"],
      description: tool.description,
      ...(tool.withheldFromModels === true ? { withheldFromModels: true } : {}),
    };
  };

  if (!options.tools.some((tool) => tool.name === "get_status")) {
    throw new ManifestProblem(
      "MCP tool get_status is missing; the status standard requires it.",
    );
  }

  const reads = [
    ...options.tools.filter((tool) => tool.kind === "read").map(declare),
    ...(options.planned?.read ?? []),
  ];
  const actions = [
    ...options.tools.filter((tool) => tool.kind === "action").map(declare),
    ...(options.planned?.action ?? []),
  ];

  if (!existsSync(join(options.repositoryRoot, options.improvement.brief))) {
    throw new ManifestProblem(
      `The manifest names ${options.improvement.brief} as the brief and it does not exist.`,
    );
  }

  const manifest = {
    ...options.body,
    capabilities: { read: reads, action: actions },
    interfaces: options.interfaces ?? {
      mcpLocal: { status: "current", transport: "stdio", auth: "none" },
    },
    improvement: {
      brief: options.improvement.brief,
      threshold: options.improvement.threshold,
      watch: [...options.improvement.watch],
    },
  };

  // Dynamic so consumers that never emit a manifest do not need prettier.
  const { format, resolveConfig } = await import("prettier");
  const serialized = await format(JSON.stringify(manifest, null, 2), {
    ...(await resolveConfig(manifestPath)),
    parser: "json",
  });

  if (options.checkOnly) {
    const stale =
      !existsSync(manifestPath) ||
      readFileSync(manifestPath, "utf8") !== serialized;
    return {
      reads: reads.length,
      actions: actions.length,
      stale,
      manifestPath,
    };
  }
  writeFileSync(manifestPath, serialized);
  return {
    reads: reads.length,
    actions: actions.length,
    stale: false,
    manifestPath,
  };
}
