import { readFileSync, writeFileSync } from "fs";

// Bumps manifest.json + versions.json to match the new version in package.json.
// Wired up via the `version` script in package.json so `npm version <x>` runs it.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("version-bump: npm_package_version not set; run via `npm version`.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const minAppVersion = manifest.minAppVersion;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`version-bump: set version ${targetVersion} (minAppVersion ${minAppVersion}).`);
