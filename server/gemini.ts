import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function askGemini(
  prompt: string,
  context: string,
  history: { role: "user" | "model"; parts: { text: string }[] }[] = []
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: `당신은 Gemini입니다. 소프트웨어 설계와 AI 시스템 전문가로서 토론에 참여합니다.
창의적이고 도발적인 아이디어를 제시하되, 근거를 명확히 하세요.
한국어로 답변하고, 핵심만 간결하게 말하세요.

현재 프로젝트 컨텍스트:
${context}`,
  });

  const chat = model.startChat({ history });

  const result = await chat.sendMessage(prompt);
  return result.response.text();
}
