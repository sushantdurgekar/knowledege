---
title: AI-901 SDK code cheat sheet (read-the-snippet questions)
track: technical
domain: certifications
subject: ai-901
tags: [exam-ai-901, domain-2, python, sdk]
status: learning
created: 2026-10-02
updated: 2026-10-02
sources:
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-generative-ai-and-agents/3-using-generative-ai-models/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-with-generative-ai-and-agents/4-creating-an-agent/
    accessed: 2026-10-02
  - url: https://microsoftlearning.github.io/mslearn-ai-fundamentals/
    accessed: 2026-10-02
---
# SDK cheat sheet - "what package, what class, what method, what property"

| Workload | pip package | Import / client | Call | Read result |
|---|---|---|---|---|
| Chat with a model | `openai` | `OpenAI(base_url=".../openai/v1/", api_key=KEY)` | `client.responses.create(model=DEPLOYMENT, input=[...], max_output_tokens=300, temperature=0.7)` | `response.output_text` |
| Call an agent | `azure-ai-projects` (2.x), `azure-identity` | `AIProjectClient(endpoint=PROJECT_ENDPOINT, credential=DefaultAzureCredential())` | `agent = project_client.agents.get(agent_name=...)`; `oc = project_client.get_openai_client()`; `oc.responses.create(input=[...], extra_body={"agent":{"name":agent.name,"type":"agent_reference"}})` | `response.output_text` |
| Text analysis | `azure-ai-textanalytics` | `TextAnalyticsClient(endpoint, AzureKeyCredential(key))` | `detect_language([t])`, `recognize_pii_entities([t])`, `analyze_sentiment`, `extract_key_phrases`, `recognize_entities` | `.primary_language.iso6391_name`, `.redacted_text`, `.entities` |
| Speech-to-text | `azure-cognitiveservices-speech` | `SpeechConfig(subscription=KEY, endpoint=EP)`, `AudioConfig(use_default_microphone=True / filename=...)`, `SpeechRecognizer` | `recognize_once()` / `start_continuous_recognition()` | `result.text`; events `recognizing`/`recognized` |
| Text-to-speech | same | `speech_synthesis_voice_name=...`, `AudioOutputConfig(use_default_speaker=True)`, `SpeechSynthesizer` | `speak_text_async(text).get()` | `ResultReason.SynthesizingAudioCompleted` |
| Voice Live | `azure-ai-voicelive` (+pyaudio) | sample code from portal | streaming session | audio out |
| Image in prompt | `openai` | `OpenAI(...)` | content parts `input_text` + `input_image` (`image_url` = URL or base64 data URL) | `output_text` |
| Audio in prompt | `openai` | `chat.completions.create(model="gpt-4o-mini-audio-preview", modalities=["text","audio"], audio={"voice":"alloy","format":"wav"}, ...)` | part `{"type":"input_audio","input_audio":{"data":b64,"format":"wav"}}` | `choices[0].message.audio.data` (b64) |
| Image generation | `openai` | `responses.create(..., tools=[{"type":"image_generation"}])` or `images.generate(model, prompt, n=1, size="1024x1024")` | | `image_generation_call` result b64 / `data[0].b64_json` → `base64.b64decode` |
| Video generation | REST/curl | `POST .../openai/v1/videos {model:"sora-2", prompt, size, seconds}` | poll `GET /videos/{id}` | `GET /videos/{id}/content` → mp4 |
| Content Understanding | `azure-ai-contentunderstanding` | `ContentUnderstandingClient(endpoint, AzureKeyCredential(key))` | `poller = client.begin_analyze(analyzer_id="prebuilt-invoice", inputs=[{"url":...}])`; `poller.result()` | `result.contents[i].markdown`, `.fields` (value + confidence) |

## Patterns to recognise
- `begin_...` + `poller.result()` = **long-running operation (async)**: Content Understanding, batch work.
- `..._async(...).get()` = Speech SDK future.
- `DefaultAzureCredential()` = **Entra ID** (managed identity / az login), keyless. `AzureKeyCredential(key)` = key auth.
- `load_dotenv()` + `os.getenv("...")` = config in `.env`, not hard-coded.
- Message list roles: `system` (instructions), `user`, `assistant` (history).
- `max_output_tokens` ↓ when throttled; `temperature` ↓ for consistency.
- Model name in code = **deployment name** you chose, not necessarily the base model name.
