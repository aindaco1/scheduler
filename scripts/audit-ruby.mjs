import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

export async function auditRuby(lock, fetchTarget = fetch) {
  assert(
    !/^(GIT|PATH)\n/m.test(lock),
    "Ruby audit requires registry versions for every dependency",
  );
  const packages = [...lock.matchAll(/^    ([\w.-]+) \(([^)]+)\)$/gm)].map(
    ([, name, version]) => ({ name, version }),
  );
  assert(packages.length > 0, "Gemfile.lock has no auditable packages");
  const response = await fetchTarget("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: packages.map(({ name, version }) => ({
        package: { name, ecosystem: "RubyGems" },
        version,
      })),
    }),
  });
  assert(response.ok, "Ruby advisory service failed");
  const data = await response.json();
  assert(
    Array.isArray(data?.results) && data.results.length === packages.length,
    "Ruby advisory service returned incomplete results",
  );
  const findings = [];
  data.results.forEach((result, index) => {
    assert(
      result && typeof result === "object" && !Array.isArray(result),
      "Invalid Ruby advisory result",
    );
    assert(
      Object.keys(result).every(
        (key) => key === "vulns" || key === "next_page_token",
      ),
      "Unexpected Ruby advisory result",
    );
    assert(
      !result.next_page_token,
      "Ruby advisory result requires pagination; fail closed",
    );
    if (result.vulns !== undefined) {
      assert(
        Array.isArray(result.vulns) &&
          result.vulns.every((item) => typeof item?.id === "string"),
        "Invalid Ruby advisory entries",
      );
      if (result.vulns.length)
        findings.push({
          ...packages[index],
          advisories: result.vulns.map(({ id }) => id),
        });
    }
  });
  return {
    checked: new Date().toISOString(),
    ecosystem: "RubyGems",
    packages: packages.length,
    findings,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = await auditRuby(await readFile("Gemfile.lock", "utf8"));
  await mkdir("work/audit", { recursive: true });
  await writeFile(
    "work/audit/ruby-advisories.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  assert.equal(
    report.findings.length,
    0,
    "Known Ruby dependency advisories require remediation",
  );
}
