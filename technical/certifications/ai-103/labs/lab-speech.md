---
title: "Speech: generative models, Azure Speech and the Speech MCP server"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, t03]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/04-azure-speech.html
    accessed: 2026-10-02
---
# Lab: Speech: generative models, Azure Speech and the Speech MCP server

> AI-103 · about 90 min · practises [t03](../concepts/t03-speech-to-text-and-text-to-speech.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-language/Instructions/Exercises/04-azure-speech.html)

## Goal
Transcribe and synthesise with gpt-transcribe / mini-tts and with the Speech SDK (SSML); use Speech tools from an agent.

## ⚠️ Cost (low)
Per audio minute/characters; keep tests short. The MCP lab needs a Storage SAS URL: use a short expiry.

## Steps
1. Lab 03: audio.transcriptions and audio.speech with instructions.
2. Lab 04: SpeechRecognizer and SpeechSynthesizer; handle result reasons; try SSML.
3. Lab 05: Speech MCP server with an agent and a Blob SAS URL.

## Verify
- [ ] You can produce a transcript and an SSML-styled audio file.

## Break it (then fix it)
- Use a wrong key and inspect CancellationDetails.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-speech --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
