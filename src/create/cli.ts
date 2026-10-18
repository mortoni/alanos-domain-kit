#!/usr/bin/env node
/**
 * alanos-create-domain --charter FILE --target DIR --package NAME --kit SPEC --floor X.Y --owner NAME [--today YYYY-MM-DD]
 *
 * Writes a new domain repository from an approved charter, and prints the
 * files as JSON. It never runs git, a package manager or the network.
 */
import { readFile } from "node:fs/promises";
import {
  createDomain,
  CreateDomainRefused,
  type DomainCharterInput,
} from "./create-domain.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const need = (name: string): string => {
  const value = flag(name);
  if (value === undefined) {
    console.error(`--${name} is required`);
    process.exit(2);
  }
  return value;
};

try {
  const charter = JSON.parse(
    await readFile(need("charter"), "utf8"),
  ) as DomainCharterInput;
  const visibility = flag("visibility");
  const created = await createDomain({
    charter,
    target: need("target"),
    packageName: need("package"),
    kitDependency: need("kit"),
    floor: need("floor"),
    owner: need("owner"),
    today: flag("today") ?? new Date().toISOString().slice(0, 10),
    ...(visibility === "confidential" || visibility === "personal"
      ? { visibility }
      : {}),
  });
  console.log(JSON.stringify(created, null, 2));
} catch (error) {
  if (error instanceof CreateDomainRefused) {
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
  throw error;
}
