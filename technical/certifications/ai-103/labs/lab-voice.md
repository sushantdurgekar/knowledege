---
title: "Voice Live agent and translation"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, t04, t02]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/06-voice-live-agent.html
    accessed: 2026-10-02
---
# Lab: Voice Live agent and translation

> AI-103 · about 60 min · practises [t04](../concepts/t04-voice-agents-and-reasoning-over-audio.md), [t02](../concepts/t02-translate-text-and-speech.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/06-voice-live-agent.html)

## Goal
Build a real-time voice agent with Voice Live; translate text and speech.

## ⚠️ Cost (medium)
Real-time audio is billed by usage; keep sessions short and close them.

## Steps
1. Lab 06: configure Voice Live (semantic VAD, noise suppression); implement barge-in.
2. Lab 07: TextTranslationClient translate/transliterate; TranslationRecognizer for speech.

## Verify
- [ ] Interrupting the agent stops its audio; translations appear for each target language.

## Break it (then fix it)
- Switch to server_vad with a very short silence duration and observe cut-offs.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-voice --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
