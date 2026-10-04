---
title: "AI-103 misconceptions and traps"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, traps]
status: learning
created: 2026-10-04
updated: 2026-10-04
---
# AI-103: traps and misconceptions

Each line: the tempting wrong idea → the correct one. Grouped by module.

## f01: Python and Azure survival kit
- ✗ Assuming **Contributor** lets you call models and agents. → ✓ Contributor is control plane only. Calling inference or building agents needs data-plane roles like Foundry User.
- ✗ Putting the API key in code "just for now". → ✓ Keys bypass RBAC and leak through Git history. Use Entra ID, or Key Vault plus environment variables.
- ✗ Passing the model family (`gpt-4.1`) as `model`. → ✓ Foundry routes by **deployment name**. If you named the deployment `chat-prod`, pass `chat-prod`.
- ✗ Forgetting the region when quota errors appear. → ✓ Quota is per subscription, region, model and deployment type. Another region may have capacity.

## p01: Foundry platform map
- ✗ Creating a new Foundry resource per team to isolate data. → ✓ Projects already isolate agents and data. Extra resources duplicate deployments and networking.
- ✗ Using the project endpoint with Foundry Tools SDKs such as Text Analytics. → ✓ Foundry Tools SDKs want the **resource** endpoint (`*.cognitiveservices.azure.com`), not `/api/projects/...`.
- ✗ Treating Foundry Tools as obsolete because LLMs exist. → ✓ The study guide expects you to pick Foundry Tools when they're cheaper, faster or more predictable.
- ✗ Confusing Foundry IQ with file search. → ✓ File search = a vector store for an agent's own uploaded files. Foundry IQ = shared, managed knowledge bases (many sources, many agents) over Azure AI Search.

## p02: Choose the right model or tool
- ✗ Choosing the top Quality-index model for every task. → ✓ Questions usually add cost, latency or deployment constraints. The *best fit* often isn't the most capable model.
- ✗ Reading a high HarmBench score as *safer*. → ✓ HarmBench reports attack success rate: **lower** is safer.
- ✗ Using a chat model to create embeddings. → ✓ Embeddings come from embedding models (text-embedding-3-*), and documents and queries must use the same one.
- ✗ Thinking the model router increases your context window. → ✓ Its effective context window is the **smallest** of the models it routes between.
- ✗ Using an LLM to detect language or PII at massive scale. → ✓ Azure Language does this faster, cheaper and more consistently.

## p03: Deployments, quotas, rate limits and cost
- ✗ Picking Provisioned for a prototype with spiky traffic. → ✓ PTU is paid whether used or not. Spiky or unknown traffic suits Standard types.
- ✗ Thinking Global Standard stores your data outside your geography. → ✓ Data at rest stays in the geography; only processing can be global.
- ✗ Retrying 429s immediately in a loop. → ✓ That makes throttling worse. Back off and honour `retry-after`.
- ✗ Believing quota is per resource. → ✓ It's per subscription × region × model × deployment type.
- ✗ Using Batch for a real-time chatbot. → ✓ Batch is asynchronous with a 24-hour target.

## p04: Secure Foundry: identity, roles and networks
- ✗ Giving Contributor to a developer so they can build agents. → ✓ Contributor has no data actions. Developers need Foundry User.
- ✗ Using Foundry User for an app that only calls an agent's endpoint. → ✓ Least privilege is **Foundry Agent Consumer** (legacy agent applications are the exception: they need Foundry User).
- ✗ Keeping keys enabled "as a backup" while claiming Entra-only access. → ✓ Keys bypass RBAC. Disable local auth to enforce Entra ID.
- ✗ Forgetting to grant roles to the agent's own identity. → ✓ Roles on the shared project identity don't carry over (legacy: at publish; new model: from creation).
- ✗ Assuming every tool authenticates as the agent identity. → ✓ Only MCP and A2A do today; other tools use their connection's credentials.
- ✗ Mixing up basic and standard agent setup. → ✓ Standard = bring your own Cosmos DB, Storage and AI Search (data control, VNet). Basic = Microsoft-managed.

## p05: Responsible AI: guardrails and content safety
- ✗ Expecting HTTP 200 with a refusal when the prompt is filtered. → ✓ A filtered prompt returns **HTTP 400** with code `content_filter`.
- ✗ Setting the threshold to *high* to be stricter. → ✓ *High* blocks only high-severity content, the least strict setting. *Low* is strictest.
- ✗ Assuming the deployment guardrail still applies when an agent has its own. → ✓ The agent's guardrail **replaces** the deployment's.
- ✗ Using Prompt Shields for user attacks to stop poisoned documents. → ✓ Poisoned data needs **indirect attack** detection on documents and tool outputs.
- ✗ Thinking embeddings calls get content-filtered. → ✓ Embeddings (and Whisper) aren't filtered.

## p06: Govern agents: autonomy, approvals and audit
- ✗ Relying on instructions alone ("never delete records") for safety. → ✓ Instructions can be overridden. Remove or restrict the tool and require approval.
- ✗ Assuming MCP tools run without approval by default. → ✓ `require_approval` defaults to **always**.
- ✗ Using one shared identity for every agent. → ✓ Per-agent identities give least privilege and clear audit trails.
- ✗ Treating audit as "keep the chat transcript". → ✓ Audit needs tool calls, arguments, approvals, versions and provenance, captured by tracing and approval logs.

## p07: Monitor: tracing, drift and production evaluation
- ✗ Recording full prompts and responses in traces by default. → ✓ Content capture is a privacy decision: off by default, enabled deliberately with access controls.
- ✗ Monitoring only HTTP errors. → ✓ LLM failures are often quiet: low quality, ungrounded answers, slow tools. Watch quality scores and spans too.
- ✗ Evaluating 100% of production traffic. → ✓ Continuous evaluation samples traffic; evaluators cost tokens.
- ✗ Blaming the model for falling groundedness. → ✓ Check retrieval and index health first.

## p08: CI/CD and infrastructure for Foundry projects
- ✗ Storing a client secret in GitHub secrets when OIDC is available. → ✓ The exam prefers keyless federation.
- ✗ Editing production agents directly in the portal. → ✓ Changes should flow through version control, evaluation and approval.
- ✗ Comparing LLM outputs with exact-match assertions only. → ✓ Use evaluators and statistical comparison against a baseline.
- ✗ Giving the pipeline Owner on the subscription. → ✓ Scope roles to the resource group/project with the minimum needed.

## g01: Connect an app: SDKs, endpoints and the Responses API
- ✗ Reading `response.choices[0]...` from a Responses API call. → ✓ That's Chat Completions. Responses uses `output_text` / `output`.
- ✗ Passing the project endpoint to the plain `OpenAI()` client. → ✓ The plain client needs the v1 endpoint (`…/openai/v1`); or use `project.get_openai_client()`.
- ✗ Expecting `previous_response_id` to work with `store=False`. → ✓ Without storage there's nothing to chain to; send the items yourself.
- ✗ Using the model family name as `model`. → ✓ It's the deployment name.

## g02: Tune generation: prompts, parameters, reasoning and structured output
- ✗ Changing temperature and top_p together. → ✓ Guidance is to adjust one of them.
- ✗ Setting temperature on a reasoning model. → ✓ Most reasoning models reject it; use reasoning effort.
- ✗ Using JSON mode to guarantee a schema. → ✓ JSON mode guarantees valid JSON only. Use structured outputs with `strict`.
- ✗ Leaving an optional field out of `required` in a strict schema. → ✓ All fields must be required; use a null union for optional values.
- ✗ Asking a reasoning model to "think step by step". → ✓ It already reasons internally; just state the task and constraints.

## g03: Tool-augmented apps with the Responses API
- ✗ Thinking the model executes your function. → ✓ It only requests the call; your app executes it.
- ✗ Forgetting `call_id` in the output. → ✓ Without it the model can't match the result to the request.
- ✗ Using file search for numeric analysis of a spreadsheet. → ✓ Code interpreter computes; file search retrieves text.
- ✗ Expecting code interpreter to call the internet. → ✓ The sandbox has no network access.
- ✗ Adding dozens of tools "just in case". → ✓ More tools → slower, costlier, more wrong choices.

## g04: Ground or tune? RAG, retrieval choices and fine-tuning
- ✗ Fine-tuning to teach the model facts that change. → ✓ Facts belong in RAG; fine-tuning shapes behaviour.
- ✗ Embedding queries with a different model from the documents. → ✓ Vectors must come from the same model and dimension.
- ✗ Using vector-only search for product codes. → ✓ Hybrid search handles exact terms and meaning.
- ✗ Skipping the baseline before fine-tuning. → ✓ You can't prove improvement without one.
- ✗ Using a different system message in production than in training data. → ✓ Mismatch reduces fine-tuning benefits.

## g05: Evaluate models and apps
- ✗ Using BLEU or ROUGE without reference answers. → ✓ They need ground truth; use AI-assisted evaluators instead.
- ✗ Treating relevance as a fabrication detector. → ✓ An answer can be relevant and still made up. Groundedness catches fabrication.
- ✗ Using the same small model as both app and judge. → ✓ Use a strong, separate judge model.
- ✗ Evaluating once before launch only. → ✓ Re-run on changes and evaluate production continuously.

## g06: Reflection loops, multi-model flows and hybrid rules
- ✗ Letting a reflection loop run until the model is satisfied. → ✓ Always cap cycles; set a stopping test.
- ✗ Using an LLM to enforce numeric limits. → ✓ Deterministic rules or code enforce limits exactly.
- ✗ Assuming self-critique by the same model catches its own errors reliably. → ✓ Use explicit checklists, external validators or a different critic model.
- ✗ Escalating every request to the biggest model "to be safe". → ✓ Cascades and routers keep quality on hard cases at a fraction of the cost.

## a01: Agent anatomy in Foundry Agent Service
- ✗ Calling the published agent with an API key. → ✓ Agent applications accept Entra ID tokens only.
- ✗ Assuming the published agent keeps the project identity's permissions. → ✓ It has its own identity; roles on the shared project identity don't carry over.
- ✗ Assuming every tool authenticates as the agent identity. → ✓ Today only MCP and A2A tools do; other tools use their connection's credentials (key, project managed identity or OAuth passthrough).
- ✗ Choosing a hosted agent when a prompt agent would do. → ✓ Hosted agents are for custom code, frameworks, protocols or state; prompt agents need no hosting.
- ✗ Thinking publishing changes the endpoint URL on every update. → ✓ *Publish updates* keeps the URL and routes traffic to the new version.

## a02: Build agents in code (Agent Service SDK)
- ✗ Calling `responses.create` on `AIProjectClient`. → ✓ Responses come from the OpenAI client returned by `get_openai_client()`.
- ✗ Expecting the service to execute your function tool. → ✓ Function tools run in your app; only built-in tools run on the service.
- ✗ Forgetting `call_id` on outputs. → ✓ Each output must match its `function_call`.
- ✗ Polling run status in v2. → ✓ There are no runs to poll; responses return or raise.
- ✗ Creating agent versions per request. → ✓ Create once; reference by name at runtime.

## a03: Agent tools: catalog, OpenAPI, functions and more
- ✗ Writing a function tool for a REST API that already has an OpenAPI spec. → ✓ The OpenAPI tool calls it directly with less code.
- ✗ Using web search for internal documents. → ✓ Internal knowledge → file search, Azure AI Search or Foundry IQ.
- ✗ Storing an API key inside the OpenAPI spec. → ✓ Use a project connection or managed identity.
- ✗ Giving every agent every tool. → ✓ More tools → slower, costlier, more wrong calls.

## a04: MCP tools and approval loops
- ✗ Assuming MCP tools run without approval by default. → ✓ Default is `require_approval="always"`.
- ✗ Confusing MCP transports. → ✓ stdio = local; streamable HTTP = remote.
- ✗ Thinking agents must be redeployed when a server adds a tool. → ✓ Clients discover tools dynamically (`list_tools`).
- ✗ Treating third-party MCP servers as trusted. → ✓ Their outputs can carry injected instructions: approve, restrict and monitor.
- ✗ Putting auth secrets in `server_url` query strings. → ✓ Use a project connection for headers or Entra/OAuth.

## a05: Knowledge and memory for agents: Foundry IQ
- ✗ Using file search for knowledge shared by many agents. → ✓ File search is per agent/app; shared curated knowledge suits Foundry IQ.
- ✗ Using memory as the company knowledge base. → ✓ Memory is for user context; organisational knowledge belongs in Foundry IQ/AI Search.
- ✗ Forgetting Search Index Data Reader for the project identity. → ✓ Without it, keyless retrieval fails.
- ✗ Choosing indexed SharePoint when permissions change constantly. → ✓ Remote SharePoint is live and permission-trimmed.

## a06: Publish agents to Teams, Microsoft 365 and apps
- ✗ Expecting org-wide (People in your organization) agents to appear immediately. → ✓ They need admin approval first.
- ✗ Giving a legacy agent application's caller Foundry Agent Consumer. → ✓ Agent Consumer covers agent endpoints only; agent applications need Foundry User (applications/invoke/action).
- ✗ Assuming Foundry roles cover the Teams publish. → ✓ Creating the Bot Service resource needs Azure Bot Service Contributor (or Contributor).
- ✗ Publishing without registering Microsoft.BotService. → ✓ The Teams/M365 publish creates a Bot Service resource, so the provider must be registered.
- ✗ Putting API keys in agent metadata. → ✓ Metadata is visible; never include secrets.
- ✗ Assuming Work IQ works without M365 Copilot licences. → ✓ It requires licences and admin consent.

## a07: Foundry workflows: visual multi-step and human-in-the-loop
- ✗ Expecting workflows to autosave. → ✓ Saves are manual; each save is an immutable version.
- ✗ Parsing free text in conditions. → ✓ Use a JSON schema output and a JSON variable.
- ✗ Thinking workflows are invoked differently from agents. → ✓ Both use `agent_reference` by name.
- ✗ Using a workflow for a simple single-agent Q&A. → ✓ Workflows add value when steps, branches or human checks are explicit.

## a08: Microsoft Agent Framework and orchestration patterns
- ✗ Using concurrent orchestration when step 2 needs step 1's output. → ✓ Dependent steps need sequential (or graph edges).
- ✗ Putting six agents in a group chat. → ✓ Group chat works best with a few agents; more increases cost and confusion.
- ✗ Choosing magentic for a fixed three-step process. → ✓ Sequential is cheaper, faster and more predictable.
- ✗ Forgetting loop protection in handoff. → ✓ Agents can bounce control back and forth indefinitely.
- ✗ Assuming Agent Framework only works with Azure OpenAI. → ✓ Chat clients are provider-agnostic.

## a09: A2A: connecting remote agents
- ✗ Using A2A to share simple deterministic tools. → ✓ That's MCP's (or OpenAPI's) job.
- ✗ Thinking A2A requires both agents to use the same framework. → ✓ It's framework- and vendor-neutral.
- ✗ Expecting connected agents in new Foundry Agent Service. → ✓ They were removed; use workflows and the A2A tool.
- ✗ Trusting remote agent output blindly. → ✓ Treat it as untrusted input: validate and apply guardrails.

## t01: Text analysis with LLMs and Azure Language
- ✗ Using Azure Language sentiment or summarisation for new work. → ✓ Those features are deprecated; use LLM prompting.
- ✗ Passing the project endpoint to Foundry Tools SDKs. → ✓ Use the resource endpoint.
- ✗ Asking an LLM for labels without a schema. → ✓ Labels drift; use enums in structured outputs.
- ✗ Sending raw PII to an LLM unnecessarily. → ✓ Redact first; minimise data.
- ✗ Expecting CLU or custom question answering on AI-103. → ✓ They were removed from the AI-103 scope.

## t02: Translate text and speech
- ✗ Using the synthesizing event for several target languages. → ✓ Event-based synthesis supports only a single target; use a synthesizer per language.
- ✗ Confusing transliteration with translation. → ✓ Transliteration changes script; meaning and language stay.
- ✗ Using an LLM to translate thousands of formatted documents. → ✓ Document translation preserves formatting at scale.
- ✗ Forgetting the region with key auth for Translator's global endpoint. → ✓ Provide region (or use the resource endpoint).

## t03: Speech to text and text to speech
- ✗ Treating NoMatch as an error. → ✓ Canceled indicates errors; NoMatch means nothing recognisable was heard.
- ✗ Forgetting the mstts namespace when using express-as. → ✓ Styles need `xmlns:mstts`.
- ✗ Using real-time recognition for 10,000 archived recordings. → ✓ Batch transcription handles many stored files asynchronously.
- ✗ Using fine-tuning to fix drug-name recognition. → ✓ Custom speech is the speech-specific adaptation.
- ✗ Sharing a long-lived SAS URL with the Speech MCP server. → ✓ Treat SAS as a secret with short expiry and minimal permissions.

## t04: Voice agents and reasoning over audio
- ✗ Ignoring barge-in. → ✓ Without stopping playback on speech_started, the agent talks over users.
- ✗ Using silence-based VAD with long thinking pauses. → ✓ Semantic VAD handles pauses and fillers better.
- ✗ Using Voice Live for batch analysis of recordings. → ✓ Voice Live is real-time; use transcription or Content Understanding for archives.
- ✗ Thinking browser clients can send Entra tokens in WebSocket headers. → ✓ Browsers can't set custom WebSocket headers, so keys or tokens go in the query string (prefer a server-side relay).

## v01: Multimodal understanding: captions, alt text and visual Q&A
- ✗ Starting alt text with "Image of…". → ✓ Screen readers already announce images; describe purpose.
- ✗ Giving decorative images descriptive alt text. → ✓ Decorative images should have empty alt so screen readers skip them.
- ✗ Expecting reliable pixel-accurate boxes from free-text answers. → ✓ Use Content Understanding or detection models for precise regions.
- ✗ Sending a local file path as `image_url`. → ✓ Send a public/SAS URL or a base64 data URL.

## v02: Image generation and editing
- ✗ Making the area to keep transparent. → ✓ Transparent = edited; opaque = kept.
- ✗ Using a mask of a different size. → ✓ The mask must match the image dimensions.
- ✗ Expecting `background="transparent"` with JPEG. → ✓ Transparency needs PNG.
- ✗ Expecting transparent backgrounds from every gpt-image model. → ✓ Microsoft documents `background="transparent"` for gpt-image-1 only (limited access; retires 23 Oct 2026).
- ✗ Using input_fidelity on gpt-image-1-mini. → ✓ The mini model doesn't support it.
- ✗ Planning new work on DALL-E 3. → ✓ It's retired; use the gpt-image family or FLUX.

## v03: Video generation and editing with Sora 2
- ✗ Expecting synchronous video results. → ✓ It's an async job: create → poll → download.
- ✗ Using 1920x1080 or 30-second durations. → ✓ Sora 2 sizes are 1280x720/720x1280 with 4, 8 or 12 seconds.
- ✗ Reference image of a different size than the output. → ✓ It must match the output size.
- ✗ Asking a remix for five changes at once. → ✓ One focused change per remix gives predictable results.
- ✗ Generating a public figure for an ad. → ✓ Real people and public figures are blocked.

## v04: Responsible AI for visual content
- ✗ Assuming only text prompts can carry injections. → ✓ Text inside images, PDFs and web pages can carry indirect injections.
- ✗ Relying on the model to "notice" policy violations without a schema. → ✓ Turn rules into fields with confidence and route uncertain cases.
- ✗ Thinking C2PA is a visible watermark. → ✓ C2PA is embedded provenance metadata; visible watermarks are separate.
- ✗ One global threshold for all audiences. → ✓ Children's or workplace audiences need stricter thresholds.

## v05: Content Understanding for images and video
- ✗ Using pro mode for images or video. → ✓ Pro mode is documents only.
- ✗ Expecting confidence scores from pro mode. → ✓ Pro mode returns no confidence or grounding.
- ✗ Expecting confidence scores from an image or video analyzer. → ✓ Only document analyzers return confidence and grounding (estimateFieldSourceAndConfidence).
- ✗ Planning new production work on pro mode. → ✓ Its preview API is retired; use agentic mode (preview) or retrieval + reasoning.
- ✗ Using extract fields for inferred values. → ✓ Extract is verbatim; use generate or classify for inferences.
- ✗ Calling CU before default model deployments are configured. → ✓ CU needs its default deployments set up.

## x01: Content Understanding for documents and RAG
- ✗ Indexing raw OCR text when tables matter. → ✓ Markdown from layout analysis keeps tables and headings intact.
- ✗ Using extract for a value that must be inferred. → ✓ Use generate (or classify for enums).
- ✗ Ignoring confidence scores. → ✓ They exist to drive routing and review.
- ✗ Calling the URL operation with local bytes. → ✓ Use `:analyzeBinary` (or `begin_analyze_binary`) for bytes.

## x02: OCR, layout and Document Intelligence
- ✗ Choosing a template model for varied layouts. → ✓ Template needs fixed layouts; use neural (or CU).
- ✗ Using Read when you need tables. → ✓ Read is text only; Layout adds tables and structure.
- ✗ Expecting password-protected PDFs to work. → ✓ They're not supported.
- ✗ Training with a single sample. → ✓ You need several labelled samples (about 5 minimum).

## x03: Azure AI Search: ingest, enrich and index
- ✗ Forgetting to attach a Foundry resource for billable skills. → ✓ Beyond the small free allowance, AI skills need an attached resource.
- ✗ Mapping enrichment outputs with field mappings. → ✓ Enrichment nodes use **output** field mappings.
- ✗ Making a field facetable when you only need to filter. → ✓ Each attribute adds index size; enable only what you use.
- ✗ Assuming indexer failures stop the run and alert you. → ✓ Failed items are logged; you must monitor execution history.

## x04: Search for grounding: vector, hybrid, semantic and RAG pipelines
- ✗ Expecting the semantic ranker to find documents keyword/vector search missed. → ✓ It only re-orders the top results.
- ✗ Filtering on a field that isn't filterable. → ✓ Mark it filterable in the schema.
- ✗ Using `VectorizableTextQuery` without a vectorizer on the index. → ✓ Then pass your own vector with `VectorizedQuery`.
- ✗ Changing the embedding model without re-indexing. → ✓ Vectors must come from the same model.
- ✗ Lowercase/uppercase mismatch in `$filter` values. → ✓ Filter string comparisons are case-sensitive.

