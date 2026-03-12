import * as fs from "fs";
import * as path from "path";

// 프로젝트 구조 분석 → Mermaid + 상세 데이터 반환
export async function generateFlowchart(projectPath: string): Promise<{ mermaid: string; structure: ProjectStructure; projectRoot: string }> {
  const structure = analyzeProject(projectPath);
  const mermaid = buildMermaid(structure);
  return { mermaid, structure, projectRoot: projectPath };
}

interface ProjectStructure {
  name: string;
  files: FileInfo[];
  dirs: string[];
  entrypoints: string[];
  imports: Map<string, string[]>; // 파일 → import 목록
  comments: Map<string, string[]>; // 파일 → 주요 주석 목록
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
  const comments = new Map<string, string[]>();

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
              comments.set(rel, extractComments(content, ext));
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
    comments,
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

// 파일에서 의미있는 주석 추출 (한국어 우선, 영어도 포함)
function extractComments(content: string, ext: string): string[] {
  const result: string[] = [];
  const lines = content.split("\n");

  if (ext === ".py") {
    for (const line of lines) {
      const m = line.match(/^\s*#\s*(.+)/);
      if (m) {
        const c = m[1].trim();
        // 너무 짧거나 코딩 지시어 제외
        if (c.length > 4 && !/^(type:|noqa|pylint|coding)/i.test(c) && !c.startsWith("!")) result.push(c);
      }
    }
    // docstring도 포함 (첫 번째 """...""")
    const docMatch = content.match(/"""([\s\S]*?)"""/);
    if (docMatch) {
      const doc = docMatch[1].trim().split("\n")[0].trim();
      if (doc.length > 4) result.unshift(doc);
    }
  } else if (ext === ".ts" || ext === ".js") {
    for (const line of lines) {
      const m = line.match(/^\s*\/\/\s*(.+)/);
      if (m) {
        const c = m[1].trim();
        if (c.length > 4 && !c.startsWith("eslint") && !c.startsWith("@")) result.push(c);
      }
    }
    // JSDoc 첫 줄
    const jsdoc = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
    if (jsdoc) result.unshift(jsdoc[1].trim());
  } else if (ext === ".rs") {
    for (const line of lines) {
      const m = line.match(/^\s*\/\/[\/!]?\s*(.+)/);
      if (m) {
        const c = m[1].trim();
        if (c.length > 4 && !c.startsWith("#[") && !c.startsWith("!")) result.push(c);
      }
    }
  }

  // 중복 제거, 최대 4개
  return [...new Set(result)].slice(0, 4);
}

function sanitizeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^_+/, "");
}

// 주석 텍스트를 Mermaid 노드 라벨로 안전하게 변환
function safeLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/[<>]/g, "").replace(/\n/g, " ").slice(0, 40);
}

// 큰 흐름만 — 디렉토리 단위 노드 + 진입점 연결
function buildMermaid(s: ProjectStructure): string {
  const lines: string[] = ["flowchart LR", `    %% ${s.name}`];
  const addedEdges = new Set<string>();

  function addEdge(from: string, to: string) {
    const key = `${from}-->${to}`;
    if (addedEdges.has(key) || from === to) return;
    addedEdges.add(key);
    lines.push(`    ${from} --> ${to}`);
  }

  const topDirs = [...new Set(
    s.files.map(f => f.path.split("/")[0]).filter(d => d && !d.includes("."))
  )];

  // 진입점
  for (const ep of s.entrypoints.slice(0, 2)) {
    const id = sanitizeId(ep);
    const coms = s.comments.get(ep) ?? [];
    const label = coms.length > 0 ? safeLabel(coms[0]) : path.basename(ep);
    lines.push(`    ${id}(["🚀 ${label}"])`);
  }

  // 디렉토리별 대표 노드 — 파일 수 + 첫 번째 주석
  for (const dir of topDirs.slice(0, 10)) {
    const dirFiles = s.files.filter(f => f.path.startsWith(dir + "/"));
    if (dirFiles.length === 0) continue;

    const dirId = "dir_" + sanitizeId(dir);
    // 디렉토리 내 엔트리파일이 있으면 그 주석, 없으면 첫 파일 주석
    const repFile = dirFiles.find(f => s.entrypoints.includes(f.path)) ?? dirFiles[0];
    const repComs = s.comments.get(repFile.path) ?? [];
    const desc = repComs.length > 0 ? safeLabel(repComs[0]) : dir;

    lines.push(`    ${dirId}["📁 ${dir}\\n${desc}\\n${dirFiles.length}개 파일"]`);
    lines.push(`    click ${dirId} call showDetail("${dir}")`);
  }

  // 루트 파일도 노드
  const rootFiles = s.files.filter(f => !f.path.includes("/"));
  if (rootFiles.length > 0) {
    const coms = s.comments.get(rootFiles[0].path) ?? [];
    const label = coms.length > 0 ? safeLabel(coms[0]) : rootFiles[0].path;
    lines.push(`    root_file["📄 ${label}"]`);
    lines.push(`    click root_file call showDetail(".")`);
  }

  // 진입점 → 디렉토리 연결 (import 기반)
  for (const ep of s.entrypoints.slice(0, 2)) {
    const epId = sanitizeId(ep);
    const epDir = ep.split("/")[0];
    for (const imp of s.imports.get(ep) ?? []) {
      const targetDir = topDirs.find(d =>
        s.files.some(f => f.path.startsWith(d + "/") && (
          path.basename(f.path, f.ext) === imp || f.path.includes("/" + imp)
        ))
      );
      if (targetDir && targetDir !== epDir) {
        addEdge(epId, "dir_" + sanitizeId(targetDir));
      }
    }
  }

  // 디렉토리 간 연결 (import 기반)
  for (const dir of topDirs) {
    const dirFiles = s.files.filter(f => f.path.startsWith(dir + "/"));
    for (const f of dirFiles) {
      for (const imp of s.imports.get(f.path) ?? []) {
        const targetDir = topDirs.find(d =>
          d !== dir && s.files.some(ff => ff.path.startsWith(d + "/") && (
            path.basename(ff.path, ff.ext) === imp || ff.path.includes("/" + imp)
          ))
        );
        if (targetDir) addEdge("dir_" + sanitizeId(dir), "dir_" + sanitizeId(targetDir));
      }
    }
  }

  return lines.join("\n");
}

// Mermaid + 상세 데이터 → 인터랙티브 HTML (클릭 → 사이드패널)
export function saveFlowchart(mermaid: string, projectName: string, outputPath: string, structure?: ProjectStructure, projectRoot?: string): void {
  // 상세 데이터 JSON — 파일 코드까지 포함
  const detailData: Record<string, { file: string; path: string; comments: string[]; code: string }[]> = {};
  if (structure) {
    const root = projectRoot ?? path.dirname(outputPath);
    for (const f of structure.files) {
      const dir = f.path.includes("/") ? f.path.split("/")[0] : ".";
      if (!detailData[dir]) detailData[dir] = [];
      const coms = structure.comments.get(f.path) ?? [];
      const icon = f.ext === ".py" ? "🐍" : f.ext === ".ts" ? "📘" : f.ext === ".rs" ? "🦀" : "📄";
      let code = "";
      try { code = fs.readFileSync(path.join(root, f.path), "utf-8").slice(0, 8000); } catch {}
      detailData[dir].push({ file: icon + " " + f.path, path: f.path, comments: coms, code });
    }
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${projectName} — 플로우차트</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117; color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex; flex-direction: column; height: 100vh; overflow: hidden;
  }
  header {
    background: #161b22; border-bottom: 1px solid #30363d;
    padding: 10px 20px; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  header h1 { font-size: 1rem; font-weight: 600; color: #58a6ff; }
  .badge { background: #21262d; border: 1px solid #30363d; border-radius: 20px; padding: 2px 10px; font-size: 0.72rem; color: #8b949e; }
  .hint { margin-left: auto; font-size: 0.75rem; color: #484f58; }
  .workspace { display: flex; flex: 1; overflow: hidden; }

  /* ── 차트 ── */
  #chart-area { flex: 1; overflow: auto; padding: 20px; }
  .mermaid svg { background: transparent !important; width: 100% !important; height: auto !important; max-width: none !important; }
  .mermaid .node rect, .mermaid .node circle, .mermaid .node ellipse, .mermaid .node polygon { cursor: pointer !important; }

  /* ── 파일 목록 패널 ── */
  #list-panel {
    width: 0; overflow: hidden; background: #161b22; border-left: 1px solid #30363d;
    transition: width 0.25s; flex-shrink: 0; display: flex; flex-direction: column;
  }
  #list-panel.open { width: 300px; overflow-y: auto; }
  .panel-header {
    padding: 14px 16px 10px; border-bottom: 1px solid #30363d;
    display: flex; align-items: center; gap: 8px; flex-shrink: 0; position: sticky; top: 0;
    background: #161b22; z-index: 1;
  }
  .panel-header h2 { font-size: 0.9rem; color: #58a6ff; flex: 1; }
  .close-btn { background: none; border: none; color: #8b949e; font-size: 1rem; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
  .close-btn:hover { background: #30363d; color: #e6edf3; }
  .file-card {
    margin: 8px 12px; padding: 10px 12px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 8px;
    cursor: pointer; transition: border-color 0.15s;
  }
  .file-card:hover { border-color: #388bfd; }
  .file-card.active { border-color: #58a6ff; background: #0d1f3c; }
  .file-card .fname { font-size: 0.8rem; font-weight: 600; color: #c9d1d9; word-break: break-all; }
  .file-card .com0 { font-size: 0.75rem; color: #58a6ff; margin-top: 4px; }
  .file-card .com-rest { font-size: 0.72rem; color: #6e7681; margin-top: 2px; line-height: 1.4; }

  /* ── 코드 뷰어 패널 ── */
  #code-panel {
    width: 0; overflow: hidden; background: #0d1117; border-left: 1px solid #30363d;
    transition: width 0.25s; flex-shrink: 0; display: flex; flex-direction: column;
  }
  #code-panel.open { width: 520px; overflow: hidden; }
  #code-header {
    padding: 12px 16px; border-bottom: 1px solid #30363d;
    display: flex; align-items: center; gap: 8px; flex-shrink: 0; background: #161b22;
  }
  #code-header .code-title { font-size: 0.82rem; color: #8b949e; flex: 1; word-break: break-all; }
  #code-body { flex: 1; overflow-y: auto; padding: 0; }
  pre {
    margin: 0; padding: 16px; font-family: "SF Mono", Consolas, "Courier New", monospace;
    font-size: 0.78rem; line-height: 1.6; white-space: pre-wrap; word-break: break-all;
    color: #c9d1d9;
  }
  /* 주석 줄 하이라이트 */
  .line-comment { color: #3fb950; background: rgba(63,185,80,0.07); display: block; border-radius: 2px; }
  .line-comment-inline { color: #3fb950; }
  .line-num { color: #484f58; user-select: none; margin-right: 12px; display: inline-block; width: 3ch; text-align: right; }
</style>
</head>
<body>
<header>
  <h1>🗂 ${projectName}</h1>
  <span class="badge">프로젝트 구조</span>
  <span class="hint">📌 노드 클릭 → 파일 목록 → 파일 클릭 → 코드</span>
</header>
<div class="workspace">
  <div id="chart-area">
    <div class="mermaid">
${mermaid}
    </div>
  </div>

  <!-- 파일 목록 패널 -->
  <div id="list-panel">
    <div class="panel-header">
      <h2 id="list-title">파일 목록</h2>
      <button class="close-btn" onclick="closeAll()">✕</button>
    </div>
    <div id="list-content"></div>
  </div>

  <!-- 코드 뷰어 패널 -->
  <div id="code-panel">
    <div id="code-header">
      <span class="code-title" id="code-title">코드</span>
      <button class="close-btn" onclick="closeCode()">✕</button>
    </div>
    <div id="code-body"><pre id="code-pre"></pre></div>
  </div>
</div>

<script>
const DATA = ${JSON.stringify(detailData)};

// ── 디렉토리 노드 클릭 → 파일 목록 패널 ──
function showDetail(dirName) {
  const files = DATA[dirName] || [];
  document.getElementById('list-title').textContent = '📁 ' + dirName + ' (' + files.length + ')';
  document.getElementById('list-content').innerHTML = files.map((f, i) => {
    const com0 = f.comments[0] ? '<div class="com0">' + esc(f.comments[0]) + '</div>' : '';
    const rest = f.comments.slice(1).map(c => esc(c)).join(' · ');
    const comRest = rest ? '<div class="com-rest">' + rest + '</div>' : '';
    return '<div class="file-card" id="fc'+i+'" onclick="showCode('+i+',\\''+dirName+'\\')">'
      + '<div class="fname">' + esc(f.file) + '</div>' + com0 + comRest + '</div>';
  }).join('');
  document.getElementById('list-panel').classList.add('open');
  closeCode();
}

// ── 파일 카드 클릭 → 코드 뷰어 ──
function showCode(idx, dirName) {
  const f = (DATA[dirName] || [])[idx];
  if (!f) return;

  // active 표시
  document.querySelectorAll('.file-card').forEach(el => el.classList.remove('active'));
  const card = document.getElementById('fc' + idx);
  if (card) card.classList.add('active');

  document.getElementById('code-title').textContent = f.path;
  document.getElementById('code-pre').innerHTML = highlightCode(f.code, f.path);
  document.getElementById('code-panel').classList.add('open');
}

function closeCode() {
  document.getElementById('code-panel').classList.remove('open');
  document.querySelectorAll('.file-card').forEach(el => el.classList.remove('active'));
}

function closeAll() {
  document.getElementById('list-panel').classList.remove('open');
  closeCode();
}

// ── 코드 하이라이터 (주석 줄 초록색) ──
function highlightCode(code, filePath) {
  if (!code) return '<span style="color:#484f58">// 내용 없음</span>';
  const ext = filePath.split('.').pop() || '';
  const isPy = ext === 'py';
  const isRs = ext === 'rs' || ext === 'ts' || ext === 'js';

  return code.split('\\n').map((line, i) => {
    const num = '<span class="line-num">' + (i+1) + '</span>';
    const escaped = esc(line);
    // 전체 줄이 주석인지
    const isCommentLine = isPy
      ? /^\\s*#/.test(line)
      : /^\\s*\\/\\//.test(line);
    if (isCommentLine) {
      return '<span class="line-comment">' + num + escaped + '</span>';
    }
    // 인라인 주석 (코드 뒤에 주석)
    let html = escaped;
    if (isPy && line.includes('#')) {
      const ci = line.indexOf('#');
      html = esc(line.slice(0, ci)) + '<span class="line-comment-inline">' + esc(line.slice(ci)) + '</span>';
    } else if (isRs && line.includes('//')) {
      const ci = line.indexOf('//');
      html = esc(line.slice(0, ci)) + '<span class="line-comment-inline">' + esc(line.slice(ci)) + '</span>';
    }
    return num + html;
  }).join('\\n');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

mermaid.initialize({
  startOnLoad: true, theme: 'dark',
  themeVariables: {
    darkMode: true, background: '#0d1117',
    primaryColor: '#1f6feb', primaryTextColor: '#e6edf3', primaryBorderColor: '#388bfd',
    lineColor: '#58a6ff', secondaryColor: '#21262d', tertiaryColor: '#161b22',
    clusterBkg: '#161b22', clusterBorder: '#30363d',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  flowchart: { htmlLabels: true, curve: 'basis', padding: 24 }
});

// 노드 클릭 이벤트 바인딩
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.querySelectorAll('.mermaid .node').forEach(node => {
      const id = node.id || '';
      const match = id.match(/flowchart-dir_([^-]+)/);
      if (match) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => {
          const dirKey = Object.keys(DATA).find(k =>
            k.replace(/[^a-zA-Z0-9_]/g,'_').replace(/^_+/,'') === match[1]
          );
          if (dirKey) showDetail(dirKey);
        });
      }
      // 루트 파일 노드
      if (id.includes('flowchart-root_file')) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', () => showDetail('.'));
      }
    });
  }, 800);
});
</script>
</body>
</html>`;
  fs.writeFileSync(outputPath, html, "utf-8");
}
