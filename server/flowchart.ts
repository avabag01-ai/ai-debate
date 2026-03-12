import * as fs from "fs";
import * as path from "path";

// 프로젝트 구조 분석 → Mermaid 플로우차트 생성
export async function generateFlowchart(projectPath: string): Promise<string> {
  const structure = analyzeProject(projectPath);
  const mermaid = buildMermaid(structure);
  return mermaid;
}

interface ProjectStructure {
  name: string;
  files: FileInfo[];
  dirs: string[];
  entrypoints: string[];
  imports: Map<string, string[]>; // 파일 → import 목록
  functions: Map<string, string[]>; // 파일 → 함수 목록
}

interface FileInfo {
  path: string;
  ext: string;
  size: number;
}

function analyzeProject(root: string): ProjectStructure {
  const ignore = ["node_modules", ".git", "dist", "__pycache__", ".venv", ".claude", "target"];
  const codeExts = [".py", ".ts", ".rs", ".js"];
  const files: FileInfo[] = [];
  const dirs: string[] = [];
  const imports = new Map<string, string[]>();
  const functions = new Map<string, string[]>();

  function walk(dir: string, depth = 0) {
    if (depth > 4) return;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (ignore.some(i => entry === i)) continue;
        const full = path.join(dir, entry);
        const rel = path.relative(root, full);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          dirs.push(rel);
          walk(full, depth + 1);
        } else {
          const ext = path.extname(entry);
          if (codeExts.includes(ext)) {
            files.push({ path: rel, ext, size: stat.size });
            // 파일 내용 분석
            try {
              const content = fs.readFileSync(full, "utf-8");
              imports.set(rel, extractImports(content, ext));
              functions.set(rel, extractFunctions(content, ext));
            } catch {}
          }
        }
      }
    } catch {}
  }

  walk(root);

  // 진입점 찾기
  const entrypoints = files
    .filter(f =>
      f.path.includes("main") ||
      f.path.includes("index") ||
      f.path.includes("__main__") ||
      f.path.endsWith("app.py") ||
      f.path.endsWith("server.ts")
    )
    .map(f => f.path);

  return {
    name: path.basename(root),
    files,
    dirs,
    entrypoints,
    imports,
    functions,
  };
}

function extractImports(content: string, ext: string): string[] {
  const result: string[] = [];
  if (ext === ".py") {
    const matches = content.matchAll(/^(?:from|import)\s+([\w.]+)/gm);
    for (const m of matches) result.push(m[1].split(".")[0]);
  } else if (ext === ".ts" || ext === ".js") {
    const matches = content.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm);
    for (const m of matches) result.push(m[1].replace(/^\.\//, "").replace(/\.js$/, ""));
  } else if (ext === ".rs") {
    const matches = content.matchAll(/^use\s+([\w:]+)/gm);
    for (const m of matches) result.push(m[1].split("::")[0]);
  }
  return [...new Set(result)].slice(0, 5);
}

function extractFunctions(content: string, ext: string): string[] {
  const result: string[] = [];
  if (ext === ".py") {
    const matches = content.matchAll(/^(?:async\s+)?def\s+(\w+)/gm);
    for (const m of matches) if (!m[1].startsWith("_")) result.push(m[1]);
  } else if (ext === ".ts" || ext === ".js") {
    const matches = content.matchAll(/(?:async\s+)?function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(/gm);
    for (const m of matches) result.push(m[1] || m[2]);
  } else if (ext === ".rs") {
    const matches = content.matchAll(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm);
    for (const m of matches) if (m[1] !== "main") result.push(m[1]);
  }
  return [...new Set(result)].slice(0, 6);
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "");
}

function buildMermaid(s: ProjectStructure): string {
  const lines: string[] = ["flowchart TD", `    %% ${s.name} 프로젝트 플로우차트`];

  // 디렉토리 그룹
  const topDirs = [...new Set(
    s.files.map(f => f.path.split("/")[0]).filter(d => d && !d.includes("."))
  )];

  // 진입점
  if (s.entrypoints.length > 0) {
    lines.push(`\n    %% 진입점`);
    for (const ep of s.entrypoints.slice(0, 3)) {
      const id = sanitizeId(ep);
      lines.push(`    ${id}([🚀 ${path.basename(ep)}])`);
    }
  }

  // 디렉토리별 파일 노드
  for (const dir of topDirs.slice(0, 8)) {
    const dirFiles = s.files.filter(f => f.path.startsWith(dir + "/"));
    if (dirFiles.length === 0) continue;

    const dirId = sanitizeId(dir);
    lines.push(`\n    subgraph ${dirId}["📁 ${dir}/"]`);

    for (const f of dirFiles.slice(0, 6)) {
      const fileId = sanitizeId(f.path);
      const fname = path.basename(f.path);
      const fns = s.functions.get(f.path) ?? [];
      const fnStr = fns.length > 0 ? `\n${fns.slice(0, 3).join(", ")}` : "";
      const icon = f.ext === ".py" ? "🐍" : f.ext === ".ts" ? "📘" : f.ext === ".rs" ? "🦀" : "📄";
      lines.push(`        ${fileId}["${icon} ${fname}${fnStr ? `<br/><small>${fnStr}</small>` : ""}"]`);
    }
    lines.push(`    end`);
  }

  // 루트 파일 (디렉토리 없는 것)
  const rootFiles = s.files.filter(f => !f.path.includes("/")).slice(0, 4);
  if (rootFiles.length > 0) {
    for (const f of rootFiles) {
      const fileId = sanitizeId(f.path);
      lines.push(`    ${fileId}["📄 ${f.path}"]`);
    }
  }

  // 파일 간 연결 (import 기반)
  lines.push(`\n    %% 의존성 연결`);
  for (const [filePath, imps] of s.imports) {
    const fromId = sanitizeId(filePath);
    for (const imp of imps) {
      // 프로젝트 내부 파일인지 확인
      const target = s.files.find(f =>
        path.basename(f.path, f.ext) === imp ||
        f.path.includes(imp)
      );
      if (target) {
        const toId = sanitizeId(target.path);
        if (fromId !== toId) {
          lines.push(`    ${fromId} --> ${toId}`);
        }
      }
    }
  }

  // 진입점 연결
  for (const ep of s.entrypoints.slice(0, 3)) {
    const epId = sanitizeId(ep);
    const epImps = s.imports.get(ep) ?? [];
    for (const imp of epImps) {
      const target = s.files.find(f =>
        path.basename(f.path, f.ext) === imp ||
        f.path.includes(imp)
      );
      if (target) {
        lines.push(`    ${epId} --> ${sanitizeId(target.path)}`);
      }
    }
  }

  return lines.join("\n");
}

// Mermaid → 예쁜 HTML로 저장 (브라우저에서 바로 열기)
export function saveFlowchart(mermaid: string, projectName: string, outputPath: string): void {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${projectName} — 프로젝트 플로우차트</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117;
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
  }
  header {
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 16px 32px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header h1 {
    font-size: 1.2rem;
    font-weight: 600;
    color: #58a6ff;
  }
  header span {
    font-size: 0.85rem;
    color: #8b949e;
  }
  .badge {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 0.75rem;
    color: #8b949e;
  }
  main {
    padding: 32px;
    display: flex;
    justify-content: center;
  }
  .chart-wrapper {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 32px;
    min-width: 600px;
    max-width: 100%;
    overflow-x: auto;
  }
  .mermaid {
    display: flex;
    justify-content: center;
  }
  /* Mermaid 다크 테마 오버라이드 */
  .mermaid svg {
    background: transparent !important;
  }
  footer {
    text-align: center;
    padding: 16px;
    color: #484f58;
    font-size: 0.8rem;
  }
</style>
</head>
<body>
<header>
  <h1>🗂 ${projectName}</h1>
  <span class="badge">프로젝트 플로우차트</span>
  <span style="margin-left:auto;color:#484f58;font-size:0.8rem">
    생성: ${new Date().toLocaleString("ko-KR")}
  </span>
</header>
<main>
  <div class="chart-wrapper">
    <div class="mermaid">
${mermaid}
    </div>
  </div>
</main>
<footer>ai-debate flowchart tool · avabag01</footer>
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: 'dark',
    themeVariables: {
      darkMode: true,
      background: '#161b22',
      primaryColor: '#1f6feb',
      primaryTextColor: '#e6edf3',
      primaryBorderColor: '#388bfd',
      lineColor: '#58a6ff',
      secondaryColor: '#21262d',
      tertiaryColor: '#161b22',
      nodeBorder: '#30363d',
      clusterBkg: '#21262d',
      clusterBorder: '#30363d',
      titleColor: '#e6edf3',
      edgeLabelBackground: '#21262d',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 20,
    }
  });
</script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, "utf-8");
}
