---
title: "Create a generative AI chat app"
track: technical
domain: data-ai
subject: ai-103
tags: [exam-ai-103, lab, g01]
status: new
created: 2026-10-04
updated: 2026-10-04
sources:
  - url: https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/03-foundry-sdk.html
    accessed: 2026-10-02
---
# Lab: Create a generative AI chat app

> AI-103 · about 45 min · practises [g01](../concepts/g01-connect-an-app-sdks-endpoints-and-the-responses-api.md) · [guide](https://microsoftlearning.github.io/mslearn-ai-studio/Instructions/Exercises/03-foundry-sdk.html)

## Goal
Build a Python chat client with the Foundry SDK and the Responses API.

## ⚠️ Cost (low)
A few cents of tokens.

## Prerequisites
- Python 3.12+, VS Code, Azure CLI (`az login`)

## Steps
1. Create a virtual environment and install azure-ai-projects, azure-identity, openai.
2. Connect with AIProjectClient + DefaultAzureCredential; get the OpenAI client.
3. Implement a chat loop with responses.create and previous_response_id.
4. Add streaming output.

## Verify
- [ ] The second turn remembers the first without resending history.

## Break it (then fix it)
- Pass the model family name instead of the deployment name; read the error.
- Remove your role assignment and observe the 403.

## Teardown (do it the same day)
```bash
az group delete --name rg-ai103-chat --yes --no-wait
```

## Notes from my run
- Date:
- What broke and why:
- Cost observed:
