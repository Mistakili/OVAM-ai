# OVAM AI

A voice-first real-estate assistant built for OVAM Realty.

## What it does

OVAM AI turns a natural update about a prospect into a structured CRM action using **Gemma**, then lets the agent review and save the result.

The core flow is intentionally simple:

1. Speak or describe what happened with a prospect.
2. Gemma decides whether a CRM action is needed.
3. OVAM AI extracts the lead information.
4. The agent reviews it.
5. The lead is saved to the CRM.

Voice input is part of the interface. Phone integration is the final experiment, not a dependency.

## AI

The core assistant uses **Gemma**, an open model, through Google's hosted Gemini API. Gemma 4 models are available through the Gemini API. citeturn0search4turn0search8

The model does not need to be downloaded onto the user's laptop.

Configure:

```text
GEMINI_API_KEY=your_key_here
GEMMA_MODEL=gemma-4-26b-a4b-it
```

Google documents API-key authentication for the Gemini API. citeturn0search1

## Run locally

The laptop only needs Node.js and the project dependencies.

```bash
npm install
npm run dev
```

For the AI endpoint, use a Vercel development/deployment environment with `GEMINI_API_KEY` configured.

## Why open-weight AI?

OVAM AI is built around an open model rather than making a closed AI provider the core of the product. That keeps the important lead-understanding layer replaceable and gives the project a path toward self-hosted inference later.

## Roadmap

- [x] Gemma lead extraction
- [x] CRM action contract
- [x] Simple CRM view
- [x] Browser voice capture
- [ ] Persistent server-side CRM
- [ ] Voice-driven CRM actions
- [ ] Real-world handoff to OVAM Realty
- [ ] Phone integration
