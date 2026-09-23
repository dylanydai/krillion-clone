# Krillion Clone

A minimal multiplayer category game built with Next.js for Vercel.
Players submit real items and dive deeper with uncommon answers.
Each match draws seven different prompts from a pool of 26 categories, including computer science, maths, games, food, nature, and the arts.

## Play locally

Use Node.js 22 or later. Install the dependencies and copy the environment template:

```sh
npm ci
cp .env.example .env.local
```

Set `AI_GATEWAY_API_KEY` in `.env.local` to a Vercel AI Gateway key.
A Vercel account access token is a different credential.
Keep `ROOM_STORE=memory` for local development, then start the app:

```sh
npm run dev
```

Open `http://localhost:3000`, create a room, and share its link.
Use separate browser profiles or an incognito window to test multiple players on one computer.
Each browser keeps its player identity in an HTTP-only cookie, which browser scripts cannot read.
Local rooms reset when the development process restarts.

## Deploy on Vercel

The deployed game needs shared Redis storage so that requests on different server instances see the same room.
The app uses the Upstash REST API through built-in `fetch`.
The production server refuses to use memory storage.

1. Import this repository into Vercel as a Next.js project.
2. Select Node.js 22 or later in the project configuration.
3. Connect an Upstash Redis database through the Vercel Marketplace, or use an existing database.
4. Set the environment variables below for the deployment.
5. Deploy the project.

Required production variables:

```dotenv
AI_GATEWAY_API_KEY=<your Vercel AI Gateway key>
JEV_MODEL=typesafe-ai/jev
ROOM_STORE=redis
UPSTASH_REDIS_REST_URL=<your Upstash REST endpoint>
UPSTASH_REDIS_REST_TOKEN=<your Upstash REST token>
```

Keep these variables on the server. Do not add the `NEXT_PUBLIC_` prefix.
Vercel detects the build command from the Next.js project.
The app does not need a separate WebSocket server or database migration.
Rooms expire 24 hours after their last stored change.

## Game flow

The host creates a room with a four-letter uppercase code and no player limit.
The host can also start alone to try the demo.
Each round has a three-second countdown, followed by 25 seconds to answer. The answer field and Dive button are disabled during the countdown, and the server rejects early answers.
Players use the colour picker or enter a hex value in the waiting room, then save their fish colour. Colours are shared with everyone and retained for rematches; highlights, shadows, and glow follow the colour.
After each round, a popup shows the prompt, answers, and depth gained in metres.
The host clicks Next to show the total leaderboard, then starts the next round or opens a rematch lobby.
Your fish keeps its depth between rounds. Depth is the only displayed scoring unit.
The menu, lobby, and game share the same full-screen ocean scene. Its camera follows your fish downward, moving the surface, scenery, and depth scale together.
The prompt and answer controls stay fixed over the ocean. Animated depth and round progress form a centered group at the top, with the answer field and Dive button centered at the bottom. The depth box and remaining-time bar flash red below five seconds; reduced-motion settings keep the red warning steady. The game screen has no Skip button, player list, or room code.
Background fish swim across the open ocean in both directions. Menu, lobby, round-result, and leaderboard panels share the prompt's stepped pixel border.
Every player's coloured fish moves as their accepted depth arrives; offscreen indicators show players above or below your view.
Other players' answer text stays private until the reveal.
Round results appear after all fish finish descending. The interface uses VT323 throughout, with animated controls, panels, particles, and waves.
Reduced-motion settings display the final depth immediately.

The server controls the following actions:

- Accepting submissions before the deadline.
- Keeping other players' answers private until the reveal.
- Allowing submissions and retries without an attempt limit while their submission window remains open.
- Allowing corrected answers while time remains.
- Locking accepted answers and reusing one score for matching normalized answers in the same category.
- Advancing rounds and opening rematches through the host.

The client refreshes the room every 1.5 seconds.
Concurrent changes use a version comparison so that one player cannot overwrite another player's submission.
Disconnected players do not stop a round after its deadline.

## Judging

Each answer first goes to Qwen3-14B (`alibaba/qwen-3-14b`), an Apache-2.0 model, which answers directly from its own knowledge without web search or retrieval. The verifier output is capped at 16 tokens.
The verifier returns exactly YES or NO. Regional and translated editions do not qualify as distinct items unless the prompt explicitly asks for editions. Its prompt rejects invented variants such as “Chinese Catan” unless it recognizes the exact qualifying item, and treats player answers as untrusted data.
Only YES reaches Jev for rarity scoring; NO rejects the answer with no score. There is no unresolved verification verdict.
Both requests use the existing server-side `AI_GATEWAY_API_KEY`. Set `VERIFIER_MODEL` to override the verifier; `JEV_MODEL` still controls rarity scoring.
Every submission gets a fresh verification request, even if its rarity score already exists in the room. There is no verified-answer cache, local answer catalog, whitelist, or alias table. Adding a category requires a title and prompt, plus an internal ID.
The prompt hides immediately on submission and stays hidden during judging and after acceptance. Rejected answers can be corrected while time remains. The timer stays visible during judging. The deadline is a hard cutoff: pending answers earn no depth, and late judging responses are ignored.

Verification has a 15-second timeout. Service failures and malformed outputs are retryable errors, not NO verdicts. The model can still make factual mistakes; a binary verdict is not a guarantee of truth.

The scoring rubric has six levels. The server divides Jev's result by five to produce a value from 0 to 1.
The game converts that value to depth with `Math.round(value * 100) * 10` metres.
Answers matching after Unicode, case, and whitespace normalization receive the same depth within a category. Different aliases are judged independently; there is no automatic canonical-name mapping. The deepest total after seven rounds wins, and ties share the win.

If judging fails, the player can retry the saved answer while the round timer is still running.
At the deadline, the game drops pending answers and reveals results without waiting for the judge.

Rejected answers remain unscored. Players can try another answer while time remains.

The thresholds and rubric are initial MVP settings. They need evaluation with the intended player group.
The app does not use fabricated scores when credentials or services are unavailable.

## Development checks

Run these commands before deployment:

```sh
npm run typecheck
npm test
npm run build
```

The tests cover validation gates, answer privacy, deadlines, host permissions, retries, concurrent changes, and rematches.
They use a controlled judge and local storage, so they do not spend API credits.
The test runner enforces process timeouts.

## Main files

- `app/page.tsx`: Room creation and joining.
- `app/room/[code]/game.tsx`: The lobby, rounds, results, and rematch interface.
- `app/api/rooms/`: Server routes and player cookies.
- `lib/game.ts`: Game rules and player-specific room views.
- `lib/prompt-pack.ts`: Additional category titles and prompts.
- `lib/judge.ts`: Verification gate, Jev rarity scoring, and failure messages.
- `lib/verify.ts`: Direct YES/NO verification through Vercel AI Gateway.
- `lib/store.ts`: Shared Redis storage and explicit local memory storage.
- `WORKFLOW_PLAN.md`: The original workflow design.

The API uses [Vercel's HTTP evaluation endpoint](https://vercel.com/docs/ai-gateway/modalities/evaluation).
The score follows [Jev's ordered rubric levels](https://docs.typesafe.ai/primitives/score).
The storage adapter uses the [Upstash Redis REST API](https://upstash.com/docs/redis/features/restapi).

Verification uses [Qwen3-14B](https://huggingface.co/Qwen/Qwen3-14B) through Gateway Chat Completions, without search tools.
