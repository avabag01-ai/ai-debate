#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { modeDesign, modeCode, modeDebate, modeSolo } from "./modes.js";

const server = new McpServer({
  name: "ai-debate",
  version: "2.0.0",
});

// ── 프로젝트 파일 읽기 ──
function readProjectContext(projectPath: string, maxChars = 8000): string {
  const exts = [".py", ".ts", ".rs", ".md", ".json"];
  const ignore = ["node_modules", ".git", "dist", "__pycache__", ".claude"];
  let context = "";

  function walk(dir: string, depth = 0) {
    if (depth > 3 || context.length > maxChars) return;
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (ignore.some((i) => entry.includes(i))) continue;
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (exts.some((e) => entry.endsWith(e))) {
          try {
            context += `\n\n### ${full}\n${fs.readFileSync(full, "utf-8").slice(0, 2000)}`;
          } catch {}
        }
        if (context.length > maxChars) break;
      }
    } catch {}
  }

  walk(projectPath);
  return context.slice(0, maxChars);
}

const aiCombo = z.enum(["claude", "gemini", "both"]).default("both").describe("AI 조합: claude / gemini / both");
const projectPathSchema = z.string().optional().describe("프로젝트 경로 (기본: 현재 디렉토리)");

// ════════════════════════════════════════
// 🎨 설계 모드
// ════════════════════════════════════════
server.registerTool(
  "design",
  {
    description: "설계 토론 — Gemini 창의적 제안 → Claude 검증/보완. ai=claude/gemini/both 선택 가능.",
    inputSchema: {
      topic: z.string().describe("설계 주제 (예: '수상돌기 뉴런 필터 구조')"),
      ai: aiCombo,
      project_path: projectPathSchema,
    },
  },
  async ({ topic, ai, project_path }) => {
    const context = readProjectContext(project_path ?? process.cwd());
    const result = await modeDesign(topic, context, ai ?? "both");
    return { content: [{ type: "text" as const, text: result.lines.join("\n") }] };
  }
);

// ════════════════════════════════════════
// 💻 코드 모드
// ════════════════════════════════════════
server.registerTool(
  "code",
  {
    description: "코드 구현 — Claude가 작성, Gemini가 리뷰. ai=claude/gemini/both 선택 가능.",
    inputSchema: {
      task: z.string().describe("구현할 내용 (예: 'branch_activation 함수')"),
      ai: aiCombo,
      project_path: projectPathSchema,
    },
  },
  async ({ task, ai, project_path }) => {
    const context = readProjectContext(project_path ?? process.cwd());
    const result = await modeCode(task, context, ai ?? "both");
    return { content: [{ type: "text" as const, text: result.lines.join("\n") }] };
  }
);

// ════════════════════════════════════════
// ⚔️  토론 모드
// ════════════════════════════════════════
server.registerTool(
  "debate",
  {
    description: "자유 토론 — 라운드제로 두 AI가 주제를 놓고 토론, 최종 합의 도출.",
    inputSchema: {
      topic: z.string().describe("토론 주제"),
      ai: aiCombo,
      rounds: z.number().optional().default(2).describe("토론 라운드 수 (기본: 2)"),
      project_path: projectPathSchema,
    },
  },
  async ({ topic, ai, rounds, project_path }) => {
    const context = readProjectContext(project_path ?? process.cwd());
    const result = await modeDebate(topic, context, ai ?? "both", rounds ?? 2);
    return { content: [{ type: "text" as const, text: result.lines.join("\n") }] };
  }
);

// ════════════════════════════════════════
// 🎯 빠른 질문
// ════════════════════════════════════════
server.registerTool(
  "ask",
  {
    description: "빠른 질문 — Claude/Gemini/둘 다에게 질문, 답변 나란히 비교.",
    inputSchema: {
      question: z.string().describe("질문"),
      ai: aiCombo,
      project_path: projectPathSchema,
    },
  },
  async ({ question, ai, project_path }) => {
    const context = readProjectContext(project_path ?? process.cwd());
    const result = await modeSolo(question, context, ai ?? "both");
    return { content: [{ type: "text" as const, text: result.lines.join("\n") }] };
  }
);

// ════════════════════════════════════════
// 📋 메뉴
// ════════════════════════════════════════
server.registerTool(
  "menu",
  { description: "ai-debate 사용 가능한 모드와 옵션 목록 표시.", inputSchema: {} },
  async () => {
    const menu = `
🧠 ai-debate v2.0 — Claude + Gemini 토론 MCP
${"═".repeat(50)}

📋 모드:

  🎨 design  — 설계 토론
     Gemini 창의적 제안 → Claude 검증/최종 설계
     예: design topic="수상돌기 뉴런 구조" ai=both

  💻 code    — 코드 구현 + 리뷰
     Claude 구현 → Gemini 코드 리뷰
     예: code task="branch_activation 함수" ai=both

  ⚔️  debate  — 자유 토론 (라운드제)
     두 AI가 라운드제 토론 → 합의 도출
     예: debate topic="A필터 vs B전체담당" rounds=3

  🎯 ask     — 빠른 질문 비교
     같은 질문을 두 AI에게 동시에
     예: ask question="오버피팅 어떻게 막아?" ai=both

${"─".repeat(50)}
🤖 AI 조합 옵션:
  claude  — Claude만
  gemini  — Gemini만
  both    — 둘 다 (기본값)
${"═".repeat(50)}
`.trim();
    return { content: [{ type: "text" as const, text: menu }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ai-debate MCP server v2.0 running");
}

main().catch(console.error);
