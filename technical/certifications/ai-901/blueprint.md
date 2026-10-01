---
title: AI-901 Blueprint (Microsoft Azure AI Fundamentals)
track: technical
domain: certifications
subject: ai-901
tags: [exam-ai-901, blueprint]
status: learning
created: 2026-10-02
updated: 2026-10-02
sources:
  - url: https://learn.microsoft.com/en-us/credentials/certifications/exams/ai-901/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ai-901
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/answers/questions/6008979/about-exam-pattern-of-microsoft-ai-901-exam
    accessed: 2026-10-02
---
# AI-901 Blueprint

## Exam facts (verified 2026-10-02 unless marked)
| Item | Value |
|---|---|
| Exam | AI-901: Microsoft Azure AI Fundamentals (successor of AI-900) |
| Certification | Microsoft Certified: Azure AI Fundamentals |
| Skills outline version | "Skills measured as of April 15, 2026" (study guide last updated 2026-07-13) |
| Passing score | 700 (scale 1-1000) |
| Questions | 40-60 (Microsoft Q&A answer; varies) |
| Duration | 45 min exam / 65 min seat time (Microsoft Q&A answer). Third-party blogs say 60 min. **Check on your booking confirmation.** |
| Question types | MCQ single/multi-select, drag-and-drop, hotspot, scenario (third-party; Microsoft exam sandbox shows all types: https://aka.ms/examdemo) |
| Labs on exam | None mentioned |
| Price | Varies by country (≈ USD 99; India pricing lower - check Pearson VUE) |
| Retirement | None listed. AI-900 retired 2026-06-30 (third-party, unverified on MS page) |
| Renewal | Fundamentals certifications do not expire |
| Audience | Beginner AI solution developers; Python syntax + Azure resource familiarity expected |
| Content | Mostly GA features; preview features may appear if commonly used |

## Domain 1 - Identify AI concepts and capabilities (40-45%)
### Describe principles of responsible AI
- Fairness · Reliability & safety · Privacy & security · Inclusiveness · Transparency · Accountability
### Identify AI model components and configurations
- Describe how generative AI models work
- Identify an appropriate AI model, based on capabilities
- Identify appropriate model deployment options and configuration parameters
### Identify AI workloads
- Scenarios: generative & agentic AI, text analysis, speech, computer vision, information extraction
- Text analysis techniques: keyword extraction, entity detection, sentiment analysis, summarization
- Speech recognition & speech synthesis features
- Computer vision & image-generation model features
- Techniques to extract information from text, images, audio, video

## Domain 2 - Implement AI solutions by using Microsoft Foundry (55-60%)
### Generative AI apps and agents
- Create effective system and user prompts
- Deploy a model and interact with it in the Foundry portal
- Create a lightweight chat client application by using the Foundry SDK
- Create and test a single-agent solution in the Foundry portal
- Create a lightweight client application for an agent
### Text and speech
- Build a lightweight application that includes text analysis
- Respond to spoken prompts by using a deployed multimodal model
- Build a lightweight application by using Azure Speech in Foundry Tools
### Computer vision & image generation
- Interpret visual input in prompts by using a deployed multimodal model
- Create new visual outputs by using generative models
- Build a lightweight application that includes vision capabilities
### Information extraction (Azure Content Understanding in Foundry Tools)
- Documents & forms · Images · Audio & video · Lightweight app with Content Understanding

## Mapping to Learn content
| Blueprint area | Learn module(s) | Concept note |
|---|---|---|
| Responsible AI | get-started-ai-fundamentals/7 | concepts/01-responsible-ai.md |
| How GenAI works, prompts, agents | fundamentals-generative-ai | concepts/02-genai-llms.md, 03-prompts-and-agents.md |
| Text analysis | introduction-language, get-started-text-analysis-azure | concepts/04-nlp-text-analysis.md |
| Speech | introduction-ai-speech, get-started-speech-azure | concepts/05-speech.md |
| Vision + image gen | introduction-computer-vision, get-started-vision-azure | concepts/06-vision-and-image-gen.md |
| Info extraction | introduction-information-extraction, get-started-information-extraction | concepts/07-information-extraction.md |
| RAG + Foundry IQ | rag-fundamentals, get-started-foundry-iq | concepts/08-rag-and-foundry-iq.md |
| Foundry platform, deployments | get-started-with-ai-in-azure, get-started-with-generative-ai-and-agents | concepts/09-foundry-platform.md |
| All SDK code | all "Azure" modules + labs | concepts/10-sdk-code-cheatsheet.md |
