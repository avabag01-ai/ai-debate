import { askGemini } from "./gemini.js";

export type AICombo = "claude" | "gemini" | "both";

export interface ModeResult {
  lines: string[];
  claude_prompt?: string; // Claude(현재 세션)에게 전달할 프롬프트
}

// ── 설계 모드: Gemini 창의적 제안 → Claude가 검증 ──
export async function modeDesign(
  topic: string,
  context: string,
  combo: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`🎨 [설계 모드] ${topic}\n${"─".repeat(50)}`);

  if (combo === "gemini") {
    const resp = await askGemini(`설계안을 제시해줘: ${topic}`, context);
    lines.push(`\n🔵 Gemini:\n${resp}`);
    return { lines };
  }

  if (combo === "claude") {
    const prompt = `설계안을 제시해줘:\n\n${topic}\n\n컨텍스트:\n${context}`;
    lines.push(`\n🟠 Claude에게 전달할 프롬프트 준비됨.`);
    return { lines, claude_prompt: prompt };
  }

  // both: Gemini 먼저 → Claude가 검증
  const geminiResp = await askGemini(
    `설계 제안: ${topic}\n\n창의적이고 도발적인 설계안을 제시해줘. 기존 틀 깨는 아이디어 환영.`,
    context
  );
  lines.push(`\n🔵 Gemini (창의적 제안):\n${geminiResp}`);
  lines.push(`\n${"─".repeat(50)}`);

  const claudePrompt =
    `Gemini가 이런 설계를 제안했어:\n\n${geminiResp}\n\n` +
    `프로젝트 컨텍스트:\n${context}\n\n` +
    `검토해줘:\n1. 유효한 부분\n2. 문제점/리스크\n3. 최종 개선 설계`;

  lines.push(`\n🟠 Claude — 위 Gemini 제안을 검토해줘 (아래 프롬프트 자동 전달됨)`);
  return { lines, claude_prompt: claudePrompt };
}

// ── 코드 모드: Claude 구현 → Gemini 코드 리뷰 ──
export async function modeCode(
  task: string,
  context: string,
  combo: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`💻 [코드 모드] ${task}\n${"─".repeat(50)}`);

  if (combo === "gemini") {
    const resp = await askGemini(`다음을 구현해줘: ${task}\n\n컨텍스트:\n${context}`, context);
    lines.push(`\n🔵 Gemini (구현):\n${resp}`);
    return { lines };
  }

  if (combo === "claude") {
    const prompt = `다음을 구현해줘. 실제 동작하는 코드로:\n\n${task}\n\n컨텍스트:\n${context}`;
    lines.push(`\n🟠 Claude에게 구현 요청 전달됨.`);
    return { lines, claude_prompt: prompt };
  }

  // both: Claude가 먼저 구현 → Gemini 리뷰
  // Claude 구현은 현재 세션에서 직접 → Gemini 리뷰만 여기서
  const claudePrompt =
    `다음을 구현해줘. 실제 동작하는 코드로:\n\n${task}\n\n컨텍스트:\n${context}\n\n` +
    `구현 후 Gemini 코드 리뷰를 받을 예정이야. 코드만 출력해줘.`;

  lines.push(`\n🟠 Claude — 구현 요청 (구현 완료 후 Gemini 리뷰 진행)`);
  lines.push(`📝 구현이 완료되면 코드를 복사해서 gemini_review 툴에 붙여넣어줘.`);
  return { lines, claude_prompt: claudePrompt };
}

// ── 코드 리뷰만 (Gemini) ──
export async function modeGeminiReview(
  code: string,
  context: string
): Promise<ModeResult> {
  const lines: string[] = [];
  const geminiResp = await askGemini(
    `다음 코드를 리뷰해줘:\n\n${code}\n\n1. 버그/문제점\n2. 성능 개선\n3. 더 나은 구현`,
    context
  );
  lines.push(`🔵 Gemini (코드 리뷰):\n${geminiResp}`);
  return { lines };
}

// ── 토론 모드: Gemini 선공 → Claude에게 반박 프롬프트 전달 ──
export async function modeDebate(
  topic: string,
  context: string,
  combo: AICombo,
  rounds: number
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`⚔️  [토론 모드] ${topic}\n${"─".repeat(50)}`);

  if (combo === "claude") {
    return { lines, claude_prompt: `다음 주제에 대해 네 입장을 말해줘:\n\n${topic}\n\n컨텍스트:\n${context}` };
  }

  if (combo === "gemini") {
    const resp = await askGemini(`토론 주제: ${topic}\n\n네 입장을 명확히 해줘.`, context);
    lines.push(`\n🔵 Gemini:\n${resp}`);
    return { lines };
  }

  // both: Gemini 선공 → Claude 반박 프롬프트 전달
  const geminiR1 = await askGemini(
    `토론 주제: ${topic}\n\n네 입장을 명확히 해줘. 도발적으로.`,
    context
  );
  lines.push(`\n🔵 Gemini (선공):\n${geminiR1}`);
  lines.push(`\n${"─".repeat(50)}`);

  const claudePrompt =
    `Gemini가 이렇게 주장했어:\n\n${geminiR1}\n\n` +
    `프로젝트 컨텍스트:\n${context}\n\n` +
    `반박해줘. 동의하는 부분과 반박할 부분 명확히 구분해서. ` +
    `총 ${rounds}라운드 토론이야 (현재 Round 1).`;

  lines.push(`\n🟠 Claude — 위 Gemini 주장에 반박해줘`);
  return { lines, claude_prompt: claudePrompt };
}

// ── 빠른 질문: Gemini만 (Claude는 현재 세션) ──
export async function modeSolo(
  question: string,
  context: string,
  ai: AICombo
): Promise<ModeResult> {
  const lines: string[] = [];
  lines.push(`🎯 [빠른 질문] ${question}\n${"─".repeat(50)}`);

  if (ai === "gemini" || ai === "both") {
    const resp = await askGemini(question, context);
    lines.push(`\n🔵 Gemini:\n${resp}`);
  }

  if (ai === "claude" || ai === "both") {
    lines.push(`\n🟠 Claude — 같은 질문에 답해줘`);
    return { lines, claude_prompt: `${question}\n\n컨텍스트:\n${context}` };
  }

  return { lines };
}
