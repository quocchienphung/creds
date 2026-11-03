import type { AiMarkId } from "../affectui-agent-tree/ai-marks.generated.ts";

/**
 * More AI engines a block can be given, beyond the first eleven in `catalog.ts`. Each one has a real logo
 * (`ai-marks.generated.ts`, from the MIT-licensed @lobehub/icons-static-svg) and is listed by who makes it, so the person can
 * find it by name. None of them is called by this page: the id is stored in the block and a connected engine decides what to do
 * with it (see "Process (engine)" in `docs/backend-api.md`). The model is free text, because this list cannot know which
 * models a person has access to.
 */
export interface RosterEntry { id: AiMarkId; label: string; hint: string; group: string; local: boolean }

const agent = (id: AiMarkId, label: string, hint: string, local = false): RosterEntry => ({ id, label, hint, group: "Coding agents", local });
const framework = (id: AiMarkId, label: string, hint: string, local = false): RosterEntry => ({ id, label, hint, group: "Agent frameworks", local });
const model = (id: AiMarkId, label: string, hint: string, local = false): RosterEntry => ({ id, label, hint, group: "Hosted models", local });
const open = (id: AiMarkId, label: string, hint: string): RosterEntry => ({ id, label, hint, group: "Local and open", local: true });
const cloud = (id: AiMarkId, label: string, hint: string): RosterEntry => ({ id, label, hint, group: "Routers and clouds", local: false });

export const roster = [
  agent("cursor", "Cursor", "AI code editor"),
  agent("githubcopilot", "GitHub Copilot", "GitHub"),
  agent("copilot", "Microsoft Copilot", "Microsoft"),
  agent("windsurf", "Windsurf", "AI code editor"),
  agent("cline", "Cline", "Coding agent in the editor", true),
  agent("roocode", "Roo Code", "Coding agent in the editor", true),
  agent("kilocode", "Kilo Code", "Coding agent in the editor", true),
  agent("devin", "Devin", "Cognition"),
  agent("openhands", "OpenHands", "Open coding agent", true),
  agent("goose", "Goose", "Local agent, Block", true),
  agent("amp", "Amp", "Sourcegraph"),
  agent("junie", "Junie", "JetBrains"),
  agent("kiro", "Kiro", "AWS"),
  agent("trae", "Trae", "ByteDance"),
  agent("qoder", "Qoder", "Alibaba"),
  agent("antigravity", "Antigravity", "Google"),
  agent("geminicli", "Gemini CLI", "Google's terminal agent", true),
  agent("opencode", "OpenCode", "Terminal coding agent", true),
  agent("openclaw", "OpenClaw", "Personal agent", true),
  agent("manus", "Manus", "General agent"),
  agent("codebuddy", "CodeBuddy", "Tencent"),
  agent("zencoder", "Zencoder", "Coding agent"),
  agent("replit", "Replit Agent", "Replit"),
  agent("lovable", "Lovable", "App builder"),
  agent("v0", "v0", "Vercel"),
  agent("codegeex", "CodeGeeX", "Zhipu"),

  framework("langchain", "LangChain", "Agent framework", true),
  framework("langgraph", "LangGraph", "Agent graphs", true),
  framework("crewai", "CrewAI", "Multi-agent crews", true),
  framework("mastra", "Mastra", "TypeScript agents", true),
  framework("pydanticai", "Pydantic AI", "Python agents", true),
  framework("metagpt", "MetaGPT", "Multi-agent software team", true),
  framework("llamaindex", "LlamaIndex", "Data agents", true),
  framework("phidata", "Phidata", "Agents with memory", true),
  framework("n8n", "n8n", "Workflow automation", true),
  framework("dify", "Dify", "Agent builder", true),
  framework("coze", "Coze", "Bot builder"),
  framework("openwebui", "Open WebUI", "Self-hosted chat", true),

  model("grok", "Grok", "xAI"),
  model("meta", "Llama", "Meta", true),
  model("cohere", "Cohere", "Command models"),
  model("perplexity", "Perplexity", "Answers with sources"),
  model("zhipu", "GLM", "Zhipu AI", true),
  model("zai", "Z.ai", "Zhipu's platform"),
  model("minimax", "MiniMax", "MiniMax models"),
  model("doubao", "Doubao", "ByteDance"),
  model("yi", "Yi", "01.AI", true),
  model("baichuan", "Baichuan", "Baichuan models", true),
  model("stepfun", "StepFun", "Step models"),
  model("hunyuan", "Hunyuan", "Tencent"),
  model("wenxin", "ERNIE", "Baidu"),
  model("spark", "Spark", "iFlytek"),
  model("internlm", "InternLM", "Shanghai AI Lab", true),
  model("nvidia", "NVIDIA", "Nemotron and NIM"),
  model("microsoft", "Microsoft", "Phi and Azure models"),
  model("ai21", "AI21", "Jamba"),
  model("reka", "Reka", "Reka models"),
  model("nousresearch", "Nous Research", "Hermes models", true),
  model("gemma", "Gemma", "Google's open models", true),
  model("moonshot", "Moonshot", "Moonshot AI"),
  model("deepmind", "DeepMind", "Google"),
  model("poe", "Poe", "Quora"),
  model("inflection", "Inflection", "Pi"),

  open("lmstudio", "LM Studio", "Runs on this machine"),
  open("vllm", "vLLM", "Self-hosted serving"),
  open("xinference", "Xinference", "Self-hosted serving"),
  open("unsloth", "Unsloth", "Fine-tuned open models"),
  open("huggingface", "Hugging Face", "Open models"),

  cloud("groq", "Groq", "Fast inference"),
  cloud("openrouter", "OpenRouter", "One key, many models"),
  cloud("together", "Together AI", "Open models, hosted"),
  cloud("fireworks", "Fireworks", "Open models, hosted"),
  cloud("cerebras", "Cerebras", "Fast inference"),
  cloud("sambanova", "SambaNova", "Fast inference"),
  cloud("deepinfra", "DeepInfra", "Open models, hosted"),
  cloud("replicate", "Replicate", "Hosted models"),
  cloud("bedrock", "Amazon Bedrock", "AWS"),
  cloud("vertexai", "Vertex AI", "Google Cloud"),
  cloud("azure", "Azure AI", "Microsoft"),
  cloud("workersai", "Workers AI", "Cloudflare"),
] as const satisfies readonly RosterEntry[];

export type RosterId = (typeof roster)[number]["id"];
