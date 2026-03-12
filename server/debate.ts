import { askClaude } from "./claude.js";
import { askGemini } from "./gemini.js";

export interface DebateMessage {
  role: "claude" | "gemini" | "system";
  content: string;
  round: number;
}

export interface DebateResult {
  topic: string;
  messages: DebateMessage[];
  consensus: string;
}

export async function runDebate(
  topic: string,
  context: string,
  rounds: number = 2,
  onMessage?: (msg: DebateMessage) => void
): Promise<DebateResult> {
  const messages: DebateMessage[] = [];

  // 히스토리 (각 AI용)
  const claudeHistory: { role: "user" | "assistant"; content: string }[] = [];
  const geminiHistory: { role: "user" | "model"; parts: { text: string }[] }[] = [];

  const emit = (msg: DebateMessage) => {
    messages.push(msg);
    onMessage?.(msg);
  };

  emit({ role: "system", content: `토론 시작: ${topic}`, round: 0 });

  // Gemini 선공
  const geminiFirstPrompt = `다음 주제에 대해 네 설계안을 제시해줘. 구체적이고 창의적으로.\n\n주제: ${topic}`;
  const geminiR1 = await askGemini(geminiFirstPrompt, context, []);
  emit({ role: "gemini", content: geminiR1, round: 1 });
  geminiHistory.push(
    { role: "user", parts: [{ text: geminiFirstPrompt }] },
    { role: "model", parts: [{ text: geminiR1 }] }
  );

  // 라운드 교대
  for (let r = 1; r <= rounds; r++) {
    // Claude가 Gemini 의견에 반응
    const claudePrompt =
      r === 1
        ? `Gemini가 이런 설계를 제안했어:\n\n${geminiR1}\n\n동의하는 부분과 반박할 부분을 명확히 해줘.`
        : `Gemini 재반박:\n\n${messages[messages.length - 1].content}\n\n최종 의견을 정리해줘.`;

    const claudeResp = await askClaude(claudePrompt, context, claudeHistory);
    emit({ role: "claude", content: claudeResp, round: r });
    claudeHistory.push(
      { role: "user", content: claudePrompt },
      { role: "assistant", content: claudeResp }
    );

    if (r < rounds) {
      // Gemini 재반박
      const geminiPrompt = `Claude가 이렇게 반박했어:\n\n${claudeResp}\n\n재반박해줘. 오버피팅, 실용성 문제 해결책 포함해서.`;
      const geminiResp = await askGemini(geminiPrompt, context, geminiHistory);
      emit({ role: "gemini", content: geminiResp, round: r });
      geminiHistory.push(
        { role: "user", parts: [{ text: geminiPrompt }] },
        { role: "model", parts: [{ text: geminiResp }] }
      );
    }
  }

  // 최종 합의 (Gemini가 코드 스켈레톤으로 정리)
  const consensusPrompt = `토론 내용을 바탕으로 최종 합의된 설계를 Python 코드 구조로 정리해줘.`;
  const consensus = await askGemini(consensusPrompt, context, geminiHistory);
  emit({ role: "system", content: `✅ 최종 합의:\n\n${consensus}`, round: rounds + 1 });

  return { topic, messages, consensus };
}
