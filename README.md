# pi-command-code-provider

**Pi extension for [CommandCode](https://commandcode.dev/)'s native `/alpha/generate` API.**

OpenCode, Kimi, MiniMax, Qwen, Groq, Cerebras — all through one provider interface.

---

## What It Does

Registers CommandCode as a model provider in Pi (personal AI agent). Supports:

- **Streaming completions** — real-time token streaming
- **Tool calling** — function calling / tool use
- **Reasoning modes** — thinking levels (o1/c4/c5)
- **Model catalog** — configurable via `config.json`

```
┌─────────────────────────────────────┐
│  Pi Agent                          │
│                                     │
│  Extension: pi-command-code-provider│
│  → CommandCode API                  │
│     → OpenCode / Kimi / MiniMax     │
│     → Qwen / Groq / Cerebras       │
└─────────────────────────────────────┘
```

---

## Supported Models

| Provider | Models |
|----------|--------|
| **OpenCode** | deepseek-v4-flash-free, minimax-m2.5-free, nemotron-3-super-free, qwen3.6-plus-free |
| **Moonshot** | Kimi-K2.5, Kimi-K2-instruct |
| **MiniMax** | MiniMax-M2.1, M2.5, M2.7 (+ highspeed variants) |
| **Qwen** | Qwen3-32B (via Groq) |
| **Groq** | Llama 3.1 8B/70B, Qwen 3 32B, Allam 2, Compound |
| **Cerebras** | Llama 3.1 8B, Qwen 3 235B |

---

## Installation

```bash
# 1. Clone into Pi extensions directory
git clone https://github.com/Das-rebel/pi-command-code-provider.git \
  ~/path-to-pi/agent/extensions/pi-command-code-provider

# 2. Install dependencies
cd pi-command-code-provider
npm install

# 3. Configure (optional — uses bundled defaults otherwise)
cp config.example.json config.json
# Edit config.json with your API key

# 4. Restart Pi
```

---

## Configuration

Create `config.json` in the extension root:

```json
{
  "enabled": true,
  "debug": false,
  "providerId": "command-code",
  "displayName": "Command Code",
  "upstreamUrl": "https://api.commandcode.dev",
  "apiKey": "YOUR_API_KEY",
  "commandCodeVersion": "auto",
  "commandCodeProvider": "commandcode",
  "requestTimeoutMs": 300000,
  "models": [
    {
      "id": "moonshotai/Kimi-K2.5",
      "name": "Kimi K2.5",
      "contextWindow": 262144,
      "maxTokens": 262144
    },
    {
      "id": "minimax/MiniMax-M2.5",
      "name": "MiniMax M2.5",
      "contextWindow": 100000,
      "maxTokens": 100000
    }
  ]
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `true` | Toggle provider on/off |
| `debug` | boolean | `false` | Enable debug logging |
| `providerId` | string | `"command-code"` | Internal ID for Pi |
| `displayName` | string | `"Command Code"` | Shown in Pi UI |
| `upstreamUrl` | string | API endpoint | CommandCode base URL |
| `apiKey` | string | `""` | Your CommandCode key |
| `requestTimeoutMs` | number | `300000` | 5 minute timeout |
| `models` | array | bundled | Available models |

---

## Scripts

```bash
npm run typecheck   # TypeScript type checking
npm run build        # Build (runs typecheck)
npm test            # Run test suite
```

---

## Architecture

```
pi-command-code-provider/
├── src/
│   └── index.ts        # Main extension entry
├── test/
│   └── *.test.ts       # Test suite
├── package.json
├── config.example.json
├── README.md
└── LICENSE
```

---

## Related

- [CommandCode](https://commandcode.dev/) — Provider API
- [Pi](https://github.com/your-pi) — Personal AI agent
- [omniclaw](https://github.com/Das-rebel/omniclaw) — Full AI orchestration

MIT License
