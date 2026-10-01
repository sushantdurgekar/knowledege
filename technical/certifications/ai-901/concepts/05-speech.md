---
title: Speech - recognition, synthesis, Voice Live, audio models
track: technical
domain: certifications
subject: ai-901
tags: [exam-ai-901, domain-1, domain-2, speech]
status: learning
created: 2026-10-02
updated: 2026-10-02
sources:
  - url: https://learn.microsoft.com/en-us/training/modules/introduction-ai-speech/3-speech-recognition/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/introduction-ai-speech/4-speech-synthesis/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-speech-azure/2-speech-recognition/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-speech-azure/3-speech-synthesis/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/training/modules/get-started-speech-azure/4-voice-live/
    accessed: 2026-10-02
  - url: https://learn.microsoft.com/en-us/azure/foundry/openai/audio-completions-quickstart
    accessed: 2026-10-02
---
# Speech

## Two capabilities
- **Speech recognition = speech-to-text (STT)**: AI "hears". Captions, call/meeting transcripts, dictation, voice commands.
- **Speech synthesis = text-to-speech (TTS)**: AI "speaks". Voice replies, read-aloud accessibility, announcements, GPS, e-learning narration, game voices.
- Both together: voice bots, **IVR**, language-learning feedback, in-car assistants, **speech translation**.

## STT pipeline (6 stages)
```mermaid
flowchart LR
  A[1 Audio capture<br/>16 kHz for speech] --> B[2 Feature extraction<br/>MFCC: 20-30 ms frames, ~13 coeffs, Mel scale]
  B --> C[3 Acoustic model<br/>frames → phoneme probabilities<br/>transformers]
  C --> D[4 Language model<br/>'there' vs 'their', domain terms]
  D --> E[5 Decoding<br/>beam search]
  E --> F[6 Post-processing<br/>capitalize, punctuation, numbers,<br/>inverse text normalization, profanity, confidence]
```
- Phoneme = smallest sound unit (English ≈ 44). Acoustic model = audio→phonemes; language model = phonemes→words.
- Inverse text normalization: "three p m" → "3 PM". Azure returns word timestamps + confidence.

## TTS pipeline (4 stages)
```mermaid
flowchart LR
  T[1 Text normalization<br/>'Dr.'→Doctor, $25.50→dollars] --> L[2 Linguistic analysis<br/>G2P grapheme→phoneme, read/read]
  L --> P[3 Prosody<br/>pitch, duration, intensity, pauses, stress]
  P --> V[4 Waveform via neural vocoder<br/>mel-spectrogram → audio; WaveNet, HiFi-GAN]
```
- Robotic voice usually = flat **prosody**, not wrong phonemes. Neural voices fix intonation. SSML tunes pitch/rate/volume/pronunciation.

## Azure Speech in Foundry Tools
- Playground: Build → Models → **AI services** → "Azure Speech - Speech to Text" (upload/record) and "Text to Speech" (choose voice, speed, pitch).
- Features: real-time STT, **fast transcription**, **batch transcription** (async, SAS URI, best-effort scheduling), custom speech, neural TTS voices, custom neural voice, SSML, TTS **avatar**, **speech translation**, language identification, pronunciation assessment, **Voice Live**.
- Real-time vs batch: live captions → real-time; archive of recordings in storage → batch.

## SDK shape (pip install azure-cognitiveservices-speech)
```python
import azure.cognitiveservices.speech as speechsdk
cfg = speechsdk.SpeechConfig(subscription=KEY, endpoint=ENDPOINT)
# STT
audio = speechsdk.audio.AudioConfig(use_default_microphone=True)   # or filename="audiofile.wav"
rec = speechsdk.SpeechRecognizer(speech_config=cfg, audio_config=audio)
result = rec.recognize_once()            # single utterance; .text
rec.start_continuous_recognition()       # events: recognizing (partial) / recognized (final)
# TTS
cfg.speech_synthesis_voice_name = 'en-US-Ava:DragonHDLatestNeural'
out = speechsdk.audio.AudioOutputConfig(use_default_speaker=True)
syn = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=out)
r = syn.speak_text_async(text).get()     # ResultReason.SynthesizingAudioCompleted / Canceled
```
- Recognizer ⇢ input (`AudioConfig`); Synthesizer ⇢ output (`AudioOutputConfig`).
- Auth: key or Microsoft Entra ID.

## Voice Live
- Fully managed **speech-to-speech** API: STT + generative model reasoning + TTS in one service (vs wiring 3 services). Uses a **generative AI model you choose** + Azure acoustic models. Can return avatars, trigger actions, handles interruptions; proactive engagement setting.
- In Foundry: enable **Voice mode** on an agent → Start session → Listening → Processing → Speaking; **cc** shows transcript. `pip install azure-ai-voicelive` (+ pyaudio, azure-identity).

## "Respond to spoken prompts with a deployed multimodal model"
- Audio-capable models (e.g., `gpt-4o-audio-preview`, `gpt-4o-mini-audio-preview`, `gpt-realtime`) accept audio directly: content part `{"type":"input_audio","input_audio":{"data": <base64>, "format":"wav"}}`, `modalities=["text","audio"]`, `audio={"voice":"alloy","format":"wav"}` → reply as text and/or audio (base64).
- Choice: one model hears & answers (multimodal) vs Azure Speech pipeline (STT→LLM→TTS) vs Voice Live (managed real-time).

## Exam traps
- STT = recognition; TTS = synthesis (don't swap).
- Hearing-impaired → captions (STT); visually-impaired → read-aloud (TTS).
- Batch for stored files; real-time for live.
- `speak_text_async(...).get()` - async needs `.get()`.

## SRS cards
ai901-sp-01..05
