# 🧠 ai-debate

> Claude + Gemini가 코드베이스를 읽고 설계 토론을 벌이는 MCP 서버

두 AI가 같은 프로젝트 컨텍스트를 바탕으로 라운드제 토론을 하고 최종 합의 설계를 도출합니다.

---

## 동작 방식

```
VSCode에서: "수상돌기 뉴런 어떻게 설계할까?"
        ↓
MCP가 현재 프로젝트 파일 자동 읽기
        ↓
🔵 Gemini 선공 → 설계 제안
🟠 Claude 반박 → 문제점 지적
🔵 Gemini 재반박 → 해결책 포함
🟠 Claude 최종 → 합의점 정리
        ↓
✅ 최종 합의 설계 (코드 스켈레톤)
```

---

## 설치

```bash
git clone https://github.com/avabag01/ai-debate
cd ai-debate
npm install
```

---

## 환경변수 설정

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="AIzaSy..."
```

---

## Claude Code MCP 등록

`~/.claude/settings.json` 에 추가:

```json
{
  "mcpServers": {
    "ai-debate": {
      "command": "npx",
      "args": ["tsx", "/path/to/ai-debate/server/index.ts"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "GEMINI_API_KEY": "AIzaSy..."
      }
    }
  }
}
```

---

## 사용법

### 토론 (debate)
```
Claude Code에서:
"이 프로젝트의 수상돌기 뉴런 설계 방향을 토론해줘"
→ MCP debate 툴 호출
→ Claude + Gemini 2라운드 토론
→ 최종 합의 설계 출력
```

### 빠른 비교 (quick_ask)
```
"수상돌기 vs 퍼셉트론 뭐가 나아?" 를 둘 다에게 물어봐줘
→ Claude 답변 + Gemini 답변 나란히 출력
```

---

## MCP 툴

| 툴 | 설명 | 파라미터 |
|----|------|---------|
| `debate` | 라운드제 토론 | `topic`, `project_path?`, `rounds?` |
| `quick_ask` | 양쪽 답변 비교 | `question`, `project_path?` |

---

## 특징

- **코드베이스 자동 읽기** — `.py`, `.ts`, `.rs`, `.md` 파일 자동 수집
- **라운드제 토론** — Gemini 선공 → Claude 반박 → 재반박 → 합의
- **최종 합의 코드** — 토론 결과를 코드 스켈레톤으로 정리
- **병렬 질문** — `quick_ask`로 두 AI 답변 동시 비교

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-12 | 최초 릴리즈 — debate, quick_ask 툴 |
