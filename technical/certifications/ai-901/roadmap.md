---
title: AI-901 3-Day Roadmap
track: technical
domain: certifications
subject: ai-901
tags: [exam-ai-901, roadmap]
status: learning
created: 2026-10-02
updated: 2026-10-02
---
# AI-901 - 3-day sprint (complete beginner, 7+ h/day)

Allocation = weight x gap. You're new to everything, so gap ≈ 1 for all → time follows weight:
Domain 2 (Foundry, 55-60%) gets ~55% of hours; Domain 1 (concepts, 40-45%) ~35%; mocks/remediation ~10-15%.
Each block = learn on the Study Hub page (story → diagram → key points → discuss → Q&A) → topic quiz → 3-4 cards.
Rule: never more than 50 min without a recall check. 10-min break every hour.

```mermaid
gantt
  dateFormat  HH:mm
  axisFormat  %H:%M
  section Day 1 · Concepts (Domain 1)
  Workloads + Responsible AI      :d1a, 09:00, 75m
  GenAI/LLMs + prompts + agents   :d1b, after d1a, 105m
  NLP techniques                  :d1c, after d1b, 60m
  Speech pipeline                 :d1d, after d1c, 50m
  Computer vision + image gen     :d1e, after d1d, 70m
  Info extraction + RAG           :d1f, after d1e, 70m
  Day-1 checkpoint quiz           :d1g, after d1f, 30m
  section Day 2 · Foundry (Domain 2)
  Azure + Foundry resource/project/endpoints :d2a, 09:00, 75m
  Models: choose, deploy, params, guardrails :d2b, after d2a, 90m
  SDK chat client + agents (code)            :d2c, after d2b, 100m
  Text: Language vs LLM, SDK, MCP            :d2d, after d2c, 60m
  Speech SDK, Voice Live, audio input        :d2e, after d2d, 60m
  Vision: image input, image + video gen     :d2f, after d2e, 60m
  section Day 3 · Close + Mock
  Content Understanding                      :d3a, 09:00, 60m
  Foundry IQ                                 :d3b, after d3a, 50m
  MOCK EXAM 1 (timed)                        :crit, d3c, after d3b, 50m
  Mock review + remediation                  :d3d, after d3c, 120m
  Official practice assessment               :d3e, after d3d, 60m
  Cheat sheet + exam tactics + sleep         :d3f, after d3e, 60m
```

## Day 1 - Domain 1: AI concepts (target: 80% on Day-1 checkpoint)
- [ ] D1.1 AI workloads map (6 workloads) + Responsible AI 6 principles  · Hub module 1-2
- [ ] D1.2 How LLMs work: tokens → embeddings → attention → next-token  · Hub module 3
- [ ] D1.3 Prompts (system/user/history), RAG/grounding intro, agents (model+instructions+tools) · Hub module 4
- [ ] D1.4 NLP: tokenization, normalization, stop words, n-grams, stemming vs lemmatization, TF-IDF, Naive Bayes, TextRank, embeddings & cosine · Hub module 5
- [ ] D1.5 Speech: STT pipeline (MFCC → acoustic → language → beam search → post-proc), TTS pipeline (normalize → G2P → prosody → vocoder) · Hub module 6
- [ ] D1.6 Vision: pixels/RGB, convolution, CNN, ViT/patches, multimodal, diffusion · Hub module 7
- [ ] D1.7 Info extraction: OCR 5 stages, field extraction 5 stages · Hub module 8
- [ ] D1.8 RAG: index pipeline, retrieve/augment/generate, evaluation metrics · Hub module 9
- [ ] D1.9 Day-1 checkpoint quiz (Hub "Quick Quiz" filter Domain 1) + review cards
- [ ] Optional no-cost labs: 'Explore generative AI', 'Explore text analytics' (browser only)

## Day 2 - Domain 2: Build with Foundry (target: read any SDK snippet and say what it does)
- [ ] D2.1 Tenant → subscription → resource group → resource; Foundry resource vs project; endpoints & auth (key vs Entra ID) · Hub module 10
- [ ] D2.2 Model catalog, model choice by task, deployment types, TPM/throttling, temperature / max_output_tokens, evaluators, guardrails · Hub module 11
- [ ] D2.3 Chat client with `OpenAI(...).responses.create` + agent client with `AIProjectClient` + `agent_reference` · Hub module 12
- [ ] D2.4 Text: LLM vs Azure Language (deterministic), `TextAnalyticsClient`, Language MCP server · Hub module 13
- [ ] D2.5 Speech: `SpeechConfig/SpeechRecognizer/SpeechSynthesizer`, real-time vs batch, Voice Live, audio input to multimodal model · Hub module 14
- [ ] D2.6 Vision: `input_image`, base64, `image_generation` tool / `images.generate`, Sora async video jobs · Hub module 15
- [ ] D2.7 If you have an Azure subscription: Lab 00 + Lab 02a (≈65 min). Delete the resource group after!

## Day 3 - Close the gaps, then simulate
- [ ] D3.1 Content Understanding: analyzers, schemas, prebuilt IDs, `begin_analyze` LRO · Hub module 16
- [ ] D3.2 Foundry IQ: knowledge base / knowledge source / agentic retrieval, MCP, Search Index Data Reader · Hub module 17
- [ ] D3.3 MOCK EXAM 1 on the Hub (45 Q, 45 min, examiner mode) → send results to Claude
- [ ] D3.4 Remediate the 2 weakest domains (mistake journal + cards)
- [ ] D3.5 Official practice assessment (AI Skills Navigator) - aim ≥ 85%
- [ ] D3.6 Cheat sheet pass (Hub "Cheat sheet"), exam tactics, sleep ≥ 7h

## Readiness gates
- Book/sit only if: Mock ≥ 80% AND official practice ≥ 85% AND no domain < 70%.
- If not met by end of Day 3: take one more remediation half-day before sitting.
