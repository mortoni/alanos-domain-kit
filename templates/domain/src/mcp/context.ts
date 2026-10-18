/** What every tool needs. Reads load state fresh on each call. */
export interface McpContext {
  readonly repositoryRoot: string;
}
