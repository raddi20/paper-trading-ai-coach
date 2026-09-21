import {
  CHAT_HISTORY_LIMIT,
  CHAT_LLM_TIMEOUT_MS,
  CHAT_MAX_MESSAGE_CHARS,
} from "./constants";
import { addCoachMessage, listCoachMessages } from "./db";
import { buildCoachContext, coachContextForPrompt } from "./coach-context";
import { answerOffline, isUnsafePrompt } from "./coach-offline";
import { sanitizeLeads } from "./coach-leads";
import type { CoachChatMessage, CoachLead } from "./types";

export function llmEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function extractJson(text: string): { reply?: string; leads?: unknown } | null {
  try {
    return JSON.parse(text) as { reply?: string; leads?: unknown };
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as { reply?: string; leads?: unknown };
    } catch {
      return null;
    }
  }
}

async function maybeLlmChat(
  question: string,
  ctx: ReturnType<typeof coachContextForPrompt>,
  history: CoachChatMessage[],
  fallback: { reply: string; leads: CoachLead[] },
): Promise<{ reply: string; leads: CoachLead[]; source: "template" | "llm" }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || isUnsafePrompt(question)) {
    return { ...fallback, source: "template" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_LLM_TIMEOUT_MS);
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const prior = history
      .slice(-12)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content: [
              "You are a calm paper-trading coach for a complete beginner.",
              "This app uses fake money only. Never give financial advice. Never encourage live trading, gambling, or guaranteed profits.",
              "Use only the provided structured context. If a list is empty, say so. Never invent fills, positions, or journal events.",
              "Plain English, short paragraphs, grade-8 reading level.",
              "End with 1–3 concrete next steps inside this app.",
              "Return JSON only: {\"reply\": string, \"leads\": [{\"label\": string, \"href\": string}] }.",
              "href must be one of /, /markets, /markets?symbol=TICKER, /journal, /settings, /coach.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              paperContext: ctx,
              history: prior,
              question,
              templateFallback: fallback,
            }),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ...fallback, source: "template" };
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { ...fallback, source: "template" };
    const parsed = extractJson(content);
    const reply = parsed?.reply?.trim();
    if (!reply) return { ...fallback, source: "template" };
    const leads = sanitizeLeads(parsed?.leads);
    return {
      reply,
      leads: leads.length ? leads : fallback.leads,
      source: "llm",
    };
  } catch {
    return { ...fallback, source: "template" };
  } finally {
    clearTimeout(timer);
  }
}

export async function listChat(): Promise<{
  messages: CoachChatMessage[];
  llmEnabled: boolean;
}> {
  return {
    messages: listCoachMessages(CHAT_HISTORY_LIMIT),
    llmEnabled: llmEnabled(),
  };
}

export async function sendChat(input: {
  message: string;
  focusSymbol?: string | null;
}): Promise<{
  user: CoachChatMessage;
  assistant: CoachChatMessage;
  llmEnabled: boolean;
}> {
  const trimmed = input.message.trim();
  if (!trimmed) {
    throw new Error("Type a question for the coach.");
  }
  if (trimmed.length > CHAT_MAX_MESSAGE_CHARS) {
    throw new Error(`Keep questions under ${CHAT_MAX_MESSAGE_CHARS} characters.`);
  }

  const focus = input.focusSymbol?.trim().toUpperCase() || null;
  const history = listCoachMessages(CHAT_HISTORY_LIMIT);
  const ctx = buildCoachContext(focus);
  const offline = answerOffline(trimmed, ctx);
  const llm = await maybeLlmChat(trimmed, coachContextForPrompt(ctx), history, {
    reply: offline.reply,
    leads: offline.leads,
  });

  const user = addCoachMessage({
    role: "user",
    content: trimmed,
    focusSymbol: focus,
  });
  const assistant = addCoachMessage({
    role: "assistant",
    content: llm.reply,
    source: llm.source,
    leads: llm.leads,
    focusSymbol: focus,
  });

  return { user, assistant, llmEnabled: llmEnabled() };
}
