import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function askClaude(
  prompt: string,
  context: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<string> {
  const systemPrompt = `당신은 Claude입니다. 소프트웨어 설계와 AI/매매 시스템 전문가로서 토론에 참여합니다.
코드베이스 컨텍스트가 주어지면 그것을 바탕으로 구체적이고 실용적인 의견을 제시하세요.
한국어로 답변하고, 핵심만 간결하게 말하세요. Gemini의 의견에 동의하거나 반박할 때는 근거를 명확히 하세요.

현재 프로젝트 컨텍스트:
${context}`;

  const messages = [
    ...history,
    { role: "user" as const, content: prompt },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  return (response.content[0] as { text: string }).text;
}
