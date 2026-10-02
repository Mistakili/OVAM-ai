# OVAM AI

A small voice-first real-estate assistant built for OVAM Realty.

## What it does

OVAM AI turns a natural description of a real-estate lead into structured CRM information using an open-weight Gemma model.

The first milestone is intentionally simple:

1. Describe the lead.
2. Gemma extracts the lead fields.
3. Review the fields.
4. Save the lead to the demo CRM.

Voice input comes after this core workflow is working. Phone integration is the final experiment, not a dependency.

## AI

The core extraction runs through Gemma using Ollama during local development.

## Run locally

Install Ollama and make Gemma available, then:

```bash
npm install
npm run dev
```

The app expects Ollama at `http://localhost:11434` by default. Override it with `GEMMA_BASE_URL` and `GEMMA_MODEL`.

## Why open-weight AI?

OVAM AI is designed around an open-weight model so the important lead-extraction logic is not locked to a single closed AI provider. The project can be run and adapted with the model under the builder's control.

## Roadmap

- [x] Lead extraction
- [x] Simple CRM view
- [ ] Browser voice input
- [ ] Voice-driven CRM actions
- [ ] Phone integration
