import { describe, it, expect } from "vitest";
import { filterRepoPaths } from "@/app/api/context/route";

describe("filterRepoPaths", () => {
  it("keeps source files of any language (.ts, .py, .go, .rb, .java)", () => {
    const paths = ["src/index.ts", "app/main.py", "lib/util.go", "services/auth.rb", "api/handler.java"];
    const result = filterRepoPaths(paths);
    expect(result).toEqual(paths);
  });

  it("keeps config and markup files (.json, .yaml, .md, .toml)", () => {
    const paths = ["package.json", "config.yaml", "README.md", "Cargo.toml"];
    expect(filterRepoPaths(paths)).toEqual(paths);
  });

  it("excludes image and media files", () => {
    const paths = ["logo.png", "icon.svg", "photo.jpg", "video.mp4", "audio.mp3"];
    expect(filterRepoPaths(paths)).toHaveLength(0);
  });

  it("excludes archive and binary-ish files", () => {
    const paths = ["archive.zip", "data.tar", "bundle.gz", "report.pdf"];
    expect(filterRepoPaths(paths)).toHaveLength(0);
  });

  it("excludes .lock and .map files", () => {
    const paths = ["yarn.lock", "package-lock.json.lock", "src/bundle.js.map"];
    expect(filterRepoPaths(paths)).toHaveLength(0);
  });

  it("excludes files inside noise directories", () => {
    const paths = [
      "node_modules/lodash/index.js",
      ".next/cache/webpack.js",
      "dist/bundle.js",
      "build/output.ts",
      "coverage/lcov.json",
      ".git/config",
      "vendor/ruby/gem.rb",
    ];
    expect(filterRepoPaths(paths)).toHaveLength(0);
  });

  it("prioritizes src/, app/, lib/, components/, services/, packages/, docs/ paths", () => {
    const paths = [
      "Makefile",
      "src/index.ts",
      "lib/util.go",
      "app/main.py",
      "components/Button.tsx",
      "services/auth.rb",
      "packages/core/index.js",
      "docs/README.md",
    ];
    const result = filterRepoPaths(paths);
    // All should be present
    expect(result).toHaveLength(paths.length);
    // Priority paths come before non-priority
    const priorityPaths = result.filter((p) =>
      ["src/", "lib/", "app/", "components/", "services/", "packages/", "docs/"].some((seg) =>
        p.includes(seg)
      )
    );
    const nonPriorityPaths = result.filter(
      (p) =>
        !["src/", "lib/", "app/", "components/", "services/", "packages/", "docs/"].some((seg) =>
          p.includes(seg)
        )
    );
    const lastPriorityIdx = result.indexOf(priorityPaths[priorityPaths.length - 1]);
    const firstNonPriorityIdx = result.indexOf(nonPriorityPaths[0]);
    expect(lastPriorityIdx).toBeLessThan(firstNonPriorityIdx);
  });

  it("truncates to 1000 paths when input exceeds limit", () => {
    const paths = Array.from({ length: 1500 }, (_, i) => `src/file${i}.ts`);
    expect(filterRepoPaths(paths)).toHaveLength(1000);
  });

  it("returns empty array for empty input", () => {
    expect(filterRepoPaths([])).toHaveLength(0);
  });

  it("keeps files where 'build' appears in filename but not as directory segment", () => {
    const result = filterRepoPaths(["src/buildUtils.ts", "lib/rebuild.go"]);
    expect(result).toEqual(["src/buildUtils.ts", "lib/rebuild.go"]);
  });
});
