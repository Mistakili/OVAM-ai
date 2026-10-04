# OVAM AI

A voice-first lead assistant built for a real realtor at OVAM Realty.

After a call, viewing, site visit, or payment conversation, the realtor can simply tell OVAM AI what happened. The assistant turns that natural-language update into a structured lead, lets the realtor correct anything, and saves it only after a clear confirmation.

**Live demo:** https://ovam-ai-fawn.vercel.app
**Code:** https://github.com/Mistakili/OVAM-ai

## The problem

Real-estate agents often finish a call or viewing with useful information trapped in their memory, a notebook, or a chat thread.

OVAM AI is designed around the moment immediately after that interaction:

> **Tell me what happened. I'll handle the CRM.**

Instead of filling out a form field by field, the realtor talks naturally. OVAM AI extracts the useful details, keeps the conversation moving, and builds the lead record in the background.

## Try it

1. Open the demo and allow microphone access.
2. Tap the microphone and talk naturally about a prospect: who you met, what they want, where, their budget, timeline, and phone number.
3. Say the phone number as one number so the speech recognizer can capture it reliably.
4. OVAM AI fills the lead card as it understands the conversation.
5. Correct anything naturally — for example, “Her name is Kemi, not Sarah.”
6. When you are satisfied, say yes to save the lead. A refusal such as “No, don't save it yet” does not save anything.
7. You can also use the note box instead of the microphone. That path sends the note through Gemma for structured lead extraction.

Saved leads currently stay in the browser using localStorage. Clearing the site's data clears them. There is no server-side CRM database yet.

## How it works

OVAM AI has two input paths that share the same lead model and CRM actions.

### Voice

Realtor speaks → AssemblyAI Voice Agent → speech recognition and turn detection → Gemma via the OVAM AI proxy → update_lead / save_lead tools → lead card and browser CRM → AssemblyAI text-to-speech.

AssemblyAI provides the real-time voice transport, speech recognition, turn detection, and speech synthesis. The lead-understanding layer can be routed through the Gemma proxy when the deployed voice configuration is enabled.

### Typed notes

Realtor types a natural-language note → /api/assistant → Gemma through the Gemini API → structured lead JSON → lead card and browser CRM.

The typed path is deliberately the simplest demonstration of Gemma: a natural-language real-estate update becomes a structured CRM record without requiring the user to fill a form.

## Gemma

OVAM AI uses the Gemma model: gemma-4-26b-a4b-it.

Gemma is responsible for understanding the realtor's natural-language lead information and producing structured CRM data.

For the voice path, api/gemma-voice.js exposes an OpenAI-compatible /chat/completions endpoint. AssemblyAI can call that endpoint as the voice agent's LLM. The proxy also removes private <thought> blocks before they can reach the spoken response and normalizes tool-call data for the upstream model.

The voice Gemma route requires both GEMMA_VOICE_BASE_URL and GEMMA_VOICE_TOKEN. If those are not configured on the stored AssemblyAI agent, AssemblyAI uses its managed model instead.

## Why open-weight AI

The project was built around Gemma because the important part of OVAM AI is not simply hearing speech — it is understanding the realtor's messy, natural-language description and turning it into useful CRM state.

Using an open-weight model gives that reasoning layer a path away from a single closed model gateway. During development, the managed Gemma route was not available for this AssemblyAI account, so the project uses an OpenAI-compatible proxy to make Gemma independently deployable for the voice path.

That separation also makes the system easier to evolve: the voice transport can change independently from the model doing the lead understanding.

## CRM behavior

- New facts update the current lead draft.
- Corrections replace the previous value.
- Known facts are not discarded just because a later message omits them.
- The assistant asks one useful follow-up at a time rather than turning the conversation into a questionnaire.
- It does not invent missing facts.
- save_lead is only called after explicit confirmation.
- A lead must have a name and phone number before the save tool accepts it.
- Payment details, follow-up information, source, preferred contact method, objections, and other useful context can also be captured.

## Project structure

src/main.jsx — Main interface, microphone client, and CRM state.
src/styles.css — UI.
api/assistant.js — Typed Gemma lead extraction.
api/assemblyai-token.js — Short-lived browser voice token.
api/chat/completions.js — Public OpenAI-compatible Gemma endpoint.
api/gemma-voice.js — Gemma proxy and streaming/tool normalization.
scripts/create-assemblyai-agent.mjs — Stored agent creation.
scripts/update-assemblyai-agent.mjs — Stored agent updates.

## Run locally

Node.js is enough.

npm install
npm run dev

Copy .env.example to .env.local and configure the required secrets.

Typed path: GEMINI_API_KEY and GEMMA_MODEL=gemma-4-26b-a4b-it.
Voice path: ASSEMBLYAI_API_KEY, ASSEMBLYAI_AGENT_ID, GEMMA_VOICE_BASE_URL, and GEMMA_VOICE_TOKEN.

The public voice proxy for the current deployment is https://ovam-ai-fawn.vercel.app/api.

Never commit .env.local or API keys.

## Voice agent setup

npm run setup:agent — creates a new AssemblyAI stored agent.
npm run update:agent — updates the existing stored agent referenced by ASSEMBLYAI_AGENT_ID.

The browser receives a short-lived AssemblyAI token from /api/assemblyai-token.js and connects directly to the AssemblyAI Voice Agent WebSocket.

## Current limitations

This is a focused working prototype for one real-world realtor workflow.

- Leads are stored locally in the browser.
- There is no shared/team CRM database yet.
- Phone integration is not required for the core experience.
- The voice path depends on AssemblyAI for real-time speech infrastructure.
- The Gemma voice route requires a publicly reachable deployment of the proxy.

## Roadmap

- [x] Natural-language lead extraction with Gemma
- [x] Voice-driven CRM workflow
- [x] Lead correction during conversation
- [x] Payment and follow-up details
- [x] Explicit confirmation before saving
- [x] Browser-based lead history
- [ ] Persistent server-side CRM
- [ ] Handoff to a named person at OVAM Realty
- [ ] Phone integration

## Built for OVAM Realty

OVAM AI started as a practical tool for a real estate business, not a generic demo.

The goal is simple:

**After a prospect interaction, the realtor should be able to talk instead of typing — and finish with a clean lead record.**