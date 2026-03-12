#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { runDebate, DebateMessage } from "./debate.js";

const server = new McpServer({
  name: "ai-debate",
  version: "1.0.0",
});

// 프로젝트 파일 읽기 헬퍼
function readProjectContext(projectPath: string, maxChars = 8000): string {
  const exts = [".py", ".ts", ".rs", ".md", ".json"];
  const ignore = ["node_modules", ".git", "dist", "__pycache__", ".claude"];
  let context = "";

  function walk(dir: string, depth = 0) {
    if (depth > 3 || context.length > maxChars) return;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (ignore.some((i) => entry.includes(i))) continue;
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        } else if (exts.some((e) => entry.endsWith(e))) {
          try {
            const content = fs.readFileSync(full, "utf-8").slice(0, 2000);
            context += `\n\n### ${full}\n${content}`;
          } catch {}
        }
        if (context.length > maxChars) break;
      }
    } catch {}
  }

  walk(projectPath);
  return context.slice(0, maxChars);
}

// ── Tool: debate ──
server.tool(
  "debate",
  "두 AI(Claude + Gemini)가 주제를 토론합니다. 코드베이스를 컨텍스트로 활용.",
  {
    topic: z.string().describe("토론 주제"),
    project_path: z.string().optional().describe("프로젝트 경로 (기본: 현재 디렉토리)"),
    rounds: z.number().optional().default(2).describe("토론 라운드 수 (기본: 2)"),
  },
  async ({ topic, project_path, rounds }) => {
    const projPath = project_path || process.cwd();
    const context = readProjectContext(projPath);

    const lines: string[] = [];
    lines.push(`🧠 AI 토론 시작`);
    lines.push(`📁 프로젝트: ${projPath}`);
    lines.push(`💬 주제: ${topic}`);
    lines.push("─".repeat(50));

    const onMessage = (msg: DebateMessage) => {
      const icon = msg.role === "claude" ? "🟠 Claude" : msg.role === "gemini" ? "🔵 Gemini" : "⚙️ System";
      if (msg.round > 0) lines.push(`\n[Round ${msg.round}] ${icon}:`);
      else lines.push(`\n${icon}:`);
      lines.push(msg.content);
      lines.push("─".repeat(50));
    };

    try {
      await runDebate(topic, context, rounds ?? 2, onMessage);
    } catch (e: any) {
      lines.push(`\n❌ 에러: ${e.message}`);
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// ── Tool: quick_ask ──
server.tool(
  "quick_ask",
  "Claude와 Gemini 둘 다에게 같은 질문을 해서 답변을 비교합니다.",
  {
    question: z.string().describe("질문"),
    project_path: z.string().optional().describe("프로젝트 경로"),
  },
  async ({ question, project_path }) => {
    const projPath = project_path || process.cwd();
    const context = readProjectContext(projPath);

    const { askClaude } = await import("./claude.js");
    const { askGemini } = await import("./gemini.js");

    const [claudeResp, geminiResp] = await Promise.all([
      askClaude(question, context),
      askGemini(question, context),
    ]);

    const lines = [
      `❓ 질문: ${question}`,
      "─".repeat(50),
      `\n🟠 Claude:\n${claudeResp}`,
      "─".repeat(50),
      `\n🔵 Gemini:\n${geminiResp}`,
    ];

    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ai-debate MCP server running");
}

main().catch(console.error);
