---
title: AI-901 traps & misconceptions
track: technical
domain: certifications
subject: ai-901
updated: 2026-10-02
---
# AI-901 traps (pre-seeded from research; add your own as you make mistakes)

| # | Trap / confusable pair | Correct model |
|---|---|---|
| 1 | Transparency vs Accountability | Transparency = users understand AI use + limits. Accountability = humans/org answerable via governance |
| 2 | Inclusiveness vs Fairness | Inclusiveness = nobody excluded (accessibility, captions). Fairness = no biased outcomes between groups |
| 3 | Reliability & safety vs Privacy & security | Confidence thresholds / testing / harm prevention vs protecting & deleting personal data |
| 4 | Stemming vs Lemmatization | Mechanical suffix chop vs valid dictionary form |
| 5 | Object detection vs segmentation | Boxes vs pixel masks |
| 6 | STT vs TTS naming | Recognition = speech→text; synthesis = text→speech |
| 7 | RAG vs fine-tuning | Runtime context, no weight change vs retraining weights |
| 8 | Keyword vs vector search | Exact codes vs meaning/paraphrase; hybrid = both |
| 9 | LLM vs Azure Language | Flexible/approximate vs deterministic/structured/pipeline/PII |
| 10 | Content Understanding vs Document Intelligence | CU handles docs+images+audio+video with semantic schemas (AI-901's named service) |
| 11 | Foundry resource vs project | Azure resource (quota, models, security) vs workspace (agents, evals, indexes) |
| 12 | Project endpoint vs Azure OpenAI endpoint | Agents/project SDK use project endpoint (Entra ID); OpenAI client uses .../openai/v1/ |
| 13 | Throttling fix | Lower max tokens/concurrency or raise TPM - temperature is irrelevant |
| 14 | Global Standard vs Data Zone | Residency requirement → Data Zone/Standard |
| 15 | Temperature | Lower = deterministic; higher = creative |
| 16 | Where persona goes | System prompt/instructions, not the user prompt |
| 17 | Model name in code | Deployment name |
| 18 | Async patterns | begin_analyze → poller.result(); Sora create → poll → download; speak_text_async().get() |
| 19 | Image generation vs image analysis | GPT-Image/FLUX (create) vs vision-enabled chat model (interpret) |
| 20 | Evaluators | Detect/score only - they don't fix outputs |
