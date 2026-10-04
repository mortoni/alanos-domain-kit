import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Make a tool whose inputs are all optional callable with no arguments at all.
 *
 * The MCP spec makes `arguments` optional on a call. The SDK nonetheless
 * parses it against `z.object(shape)`, and parsing `undefined` fails however
 * optional every member is: a client that omits the `arguments` field is told
 * `Invalid arguments for tool <name>: Required`. The status standard requires
 * a capability declared to take no arguments to be callable with none, and
 * the improvement standard's reads must be callable with nothing.
 *
 * Dropping the schema would fix the call and blind the router to the
 * parameters, which is a worse trade. So the absent field is filled in at the
 * wire, where the discrepancy actually is, and the tool keeps its published
 * schema.
 */
const withEmptyArguments = (message: JSONRPCMessage): JSONRPCMessage => {
  if (!("method" in message) || message.method !== "tools/call") return message;
  const params = (message as { params?: Record<string, unknown> }).params;
  if (params === undefined || "arguments" in params) return message;
  return {
    ...message,
    params: { ...params, arguments: {} },
  } as JSONRPCMessage;
};

class ArgumentTolerantTransport implements Transport {
  constructor(private readonly inner: Transport) {}

  onmessage?: <T extends JSONRPCMessage>(
    message: T,
    extra?: MessageExtraInfo,
  ) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  /**
   * Mirrored rather than proxied. A local stdio surface has no session id at
   * all; a getter returning `string | undefined` would not satisfy the
   * interface under `exactOptionalPropertyTypes`, and inventing a nullable one
   * to satisfy a case that cannot arise there would be dishonest about what
   * the transport is.
   */
  sessionId?: string;

  async start(): Promise<void> {
    this.inner.onmessage = (message, extra): void => {
      this.onmessage?.(withEmptyArguments(message), extra);
    };
    this.inner.onclose = (): void => this.onclose?.();
    this.inner.onerror = (error): void => this.onerror?.(error);
    await this.inner.start();
    if (this.inner.sessionId !== undefined) {
      this.sessionId = this.inner.sessionId;
    }
  }

  send(
    message: JSONRPCMessage,
    options?: Parameters<Transport["send"]>[1],
  ): Promise<void> {
    return options === undefined
      ? this.inner.send(message)
      : this.inner.send(message, options);
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }
}

export const acceptMissingArguments = (transport: Transport): Transport =>
  new ArgumentTolerantTransport(transport);
