# OVAM AI

A voice-first lead assistant for one realtor at OVAM Realty. Talk through a prospect the way you would after a viewing. Gemma fills the lead card. The lead is saved only after a clear yes.

Live demo: https://ovam-ai-fawn.vercel.app

Code: https://github.com/Mistakili/OVAM-ai

## Try it

1. Open the demo and allow the microphone.
2. Tap the mic and say who you met, what they want, where, their budget, and their phone number. Say the phone number as one number.
3. The card fills in as Gemma hears facts. Corrections replace the old fact.
4. Say yes when you want it saved. "No, do not save it yet" leaves the card unsaved.
5. To type instead, use the note box and choose **Understand this lead**. The pill **Typed leads · Gemma** means the mic is off and that box is the path in use. On a call the pill says **Voice · Gemma**.

Saved leads stay in this browser (`localStorage`). Clearing the site data clears them. There is no server-side CRM yet.

## How the two paths work

Gemma (`gemma-4-26b-a4b-it`) is the brain in both paths. AssemblyAI hears the realtor and speaks the reply. It does not decide the lead.

| Path | What you do | Code |
| --- | --- | --- |
| Typed notes | The note box posts to `/api/assistant` | `api/assistant.js` calls Gemma through the Gemini API and returns the lead as JSON |
| Voice | The browser streams audio to a stored AssemblyAI agent | The agent calls `POST {GEMMA_VOICE_BASE_URL}/chat/completions`, which is `api/chat/completions.js` re-exporting `api/gemma-voice.js` |

`api/gemma-voice.js` forces the Gemma model, drops Gemma's private `<thought>` notes so they are never spoken, and strips extra tool fields AssemblyAI sends that Gemini would reject.

## Run locally

Node.js is enough.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the keys. The dev server reads that file for the voice token and can also serve `/api/chat/completions` for local checks. AssemblyAI cannot call localhost, so a live voice call needs the public base URL below.

## Voice agent

`npm run setup:agent` creates a new AssemblyAI agent. Use it only when you intend to replace the agent id.

`npm run update:agent` updates the stored agent. If `GEMMA_VOICE_BASE_URL` and `GEMMA_VOICE_TOKEN` are both set, the call uses Gemma. Leave both blank to use AssemblyAI's managed model.

The public voice base URL for this deployment is `https://ovam-ai-fawn.vercel.app/api`.

## Environment

```text
ASSEMBLYAI_API_KEY=your_key_here
ASSEMBLYAI_AGENT_ID=your_agent_id_here
GEMINI_API_KEY=your_key_here
GEMMA_MODEL=gemma-4-26b-a4b-it
GEMMA_VOICE_BASE_URL=https://your-deployment.vercel.app/api
GEMMA_VOICE_TOKEN=a_long_random_string
```

`.env.local` is gitignored. Do not commit keys.

## Why open-weight AI

The closed AssemblyAI model gateway refused Gemma for this account, and a direct connection would have spoken Gemma's private notes aloud. Hosting a small proxy in front of Gemma is what lets the same open model read a typed note and answer the live call, and what lets that model be swapped without rebuilding the microphone path.

## Roadmap

- [x] Typed lead extraction through Gemma (`api/assistant.js`)
- [x] CRM action contract: update the draft, save only after an explicit yes
- [x] Lead card in the browser
- [x] Voice-driven CRM on a live call (`api/gemma-voice.js`)
- [ ] Handoff to one named person at OVAM Realty
- [ ] Persistent server-side CRM
- [ ] Phone integration
