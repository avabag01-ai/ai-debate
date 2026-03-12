import { askClaude } from "./claude.js";
import { askGemini } from "./gemini.js";

export type AICombo = "claude" | "gemini" | "both";
export type DebateMode = "design" | "code" | "debate" | "solo";

export interface ModeResult {
  lines: string[];
}

// ── 설계 모드: Gemini 창의적 제안 → Claude 검증/보완 ──
export async function modeDesign(
  topic: string,
  context: string,
  combo: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`🎨 [설계 모드] ${topic}\n${"─".repeat(50)}`);

  if (combo === "claude" || combo === "both") {
    if (combo === "both") {
      // Gemini 창의적 제안
      const geminiPrompt = `설계 제안 요청: ${topic}\n\n창의적이고 도발적인 설계안을 제시해줘. 기존 틀 깨는 아이디어 환영.`;
      const geminiResp = await askGemini(geminiPrompt, context);
      lines.push(`\n🔵 Gemini (창의적 제안):\n${geminiResp}`);
      lines.push(`\n${"─".repeat(50)}`);

      // Claude 검증/보완
      const claudePrompt = `Gemini 설계안:\n${geminiResp}\n\n이 설계안을 검토해줘:\n1. 실용적으로 유효한 부분\n2. 문제점/리스크\n3. 개선된 최종 설계`;
      const claudeResp = await askClaude(claudePrompt, context);
      lines.push(`\n🟠 Claude (검증 + 최종 설계):\n${claudeResp}`);
    } else if (combo === "claude") {
      const resp = await askClaude(`설계안을 제시해줘: ${topic}`, context);
      lines.push(`\n🟠 Claude:\n${resp}`);
    } else {
      const resp = await askGemini(`설계안을 제시해줘: ${topic}`, context);
      lines.push(`\n🔵 Gemini:\n${resp}`);
    }
  }

  return { lines };
}

// ── 코드 모드: Claude 구현 → Gemini 코드 리뷰 ──
export async function modeCode(
  task: string,
  context: string,
  combo: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`💻 [코드 모드] ${task}\n${"─".repeat(50)}`);

  if (combo === "claude" || combo === "both") {
    const claudePrompt = `다음 작업을 구현해줘. 실제 동작하는 코드로:\n\n${task}`;
    const claudeCode = await askClaude(claudePrompt, context);
    lines.push(`\n🟠 Claude (구현):\n${claudeCode}`);

    if (combo === "both") {
      lines.push(`\n${"─".repeat(50)}`);
      const geminiPrompt = `Claude가 이 코드를 작성했어:\n\n${claudeCode}\n\n코드 리뷰해줘:\n1. 버그/문제점\n2. 성능 개선\n3. 더 나은 구현 방법`;
      const geminiReview = await askGemini(geminiPrompt, context);
      lines.push(`\n🔵 Gemini (코드 리뷰):\n${geminiReview}`);
    }
  } else {
    // gemini only
    const resp = await askGemini(`다음을 구현해줘: ${task}`, context);
    lines.push(`\n🔵 Gemini (구현):\n${resp}`);
  }

  return { lines };
}

// ── 토론 모드: 라운드제 자유 토론 ──
export async function modeDebate(
  topic: string,
  context: string,
  combo: AICombo,
  rounds: number,
  onMessage?: (line: string) => void
): Promise<ModeResult> {
  const lines: string[] = [];
  const emit = (s: string) => { lines.push(s); onMessage?.(s); };

  emit(`⚔️  [토론 모드] ${topic}\n${"─".repeat(50)}`);

  if (combo !== "both") {
    const ask = combo === "claude" ? askClaude : askGemini;
    const icon = combo === "claude" ? "🟠 Claude" : "🔵 Gemini";
    const resp = await (combo === "claude"
      ? askClaude(topic, context)
      : askGemini(topic, context));
    emit(`\n${icon}:\n${resp}`);
    return { lines };
  }

  // Gemini 선공
  const geminiR1 = await askGemini(
    `토론 주제: ${topic}\n\n네 입장을 명확히 해줘.`,
    context
  );
  emit(`\n🔵 Gemini (Round 1):\n${geminiR1}\n${"─".repeat(50)}`);

  const claudeHist: { role: "user" | "assistant"; content: string }[] = [];
  const geminiHist: { role: "user" | "model"; parts: { text: string }[] }[] = [
    { role: "user", parts: [{ text: `토론 주제: ${topic}` }] },
    { role: "model", parts: [{ text: geminiR1 }] },
  ];

  for (let r = 1; r <= rounds; r++) {
    const prevGemini = r === 1 ? geminiR1 : lines[lines.length - 2] ?? "";
    const claudePrompt = `Gemini 주장:\n${prevGemini}\n\n${r < rounds ? "반박해줘." : "최종 합의점 정리해줘."}`;
    const claudeResp = await askClaude(claudePrompt, context, claudeHist);
    emit(`\n🟠 Claude (Round ${r}):\n${claudeResp}\n${"─".repeat(50)}`);
    claudeHist.push({ role: "user", content: claudePrompt }, { role: "assistant", content: claudeResp });

    if (r < rounds) {
      const geminiPrompt = `Claude 반박:\n${claudeResp}\n\n재반박해줘.`;
      const geminiResp = await askGemini(geminiPrompt, context, geminiHist);
      emit(`\n🔵 Gemini (Round ${r}):\n${geminiResp}\n${"─".repeat(50)}`);
      geminiHist.push(
        { role: "user", parts: [{ text: geminiPrompt }] },
        { role: "model", parts: [{ text: geminiResp }] }
      );
    }
  }

  return { lines };
}

// ── 솔로 모드: 선택한 AI 하나만 ──
export async function modeSolo(
  question: string,
  context: string,
  ai: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`🎯 [솔로 모드] ${question}\n${"─".repeat(50)}`);

  if (ai === "both" || ai === "claude") {
    const resp = await askClaude(question, context);
    lines.push(`\n🟠 Claude:\n${resp}`);
  }
  if (ai === "both" || ai === "gemini") {
    const resp = await askGemini(question, context);
    lines.push(`\n🔵 Gemini:\n${resp}`);
  }

  return { lines };
}
