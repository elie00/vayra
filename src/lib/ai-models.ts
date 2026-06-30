export type AiProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "meta"
  | "mistral"
  | "deepseek"
  | "xai"
  | "qwen";

export type AiModel = { id: string; label: string; provider: AiProvider };

export const PROVIDER_NAME: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  meta: "Meta",
  mistral: "Mistral AI",
  deepseek: "DeepSeek",
  xai: "xAI",
  qwen: "Alibaba",
};

export const DEFAULT_AI_MODEL = "openai/gpt-4o-mini";

export const AI_MODELS: AiModel[] = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", provider: "openai" },
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "openai" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", provider: "anthropic" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku", provider: "anthropic" },
  { id: "google/gemini-flash-1.5", label: "Gemini 1.5 Flash", provider: "gemini" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", provider: "deepseek" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "meta" },
  { id: "mistralai/mistral-large", label: "Mistral Large", provider: "mistral" },
  { id: "x-ai/grok-2-1212", label: "Grok 2", provider: "xai" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", provider: "qwen" },
];
