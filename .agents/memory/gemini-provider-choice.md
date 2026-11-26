---
name: Gemini provider choice
description: The user's choice to use their Gemini API key instead of Replit-managed AI Integrations.
---

Use the user's `GEMINI_API_KEY` on the API server for Gemini copy generation. Never expose the key to browser code or logs.

**Why:** The user declined an account upgrade for managed AI Integrations and confirmed the key through Replit's secure secret flow.

**How to apply:** Keep Gemini calls server-side and do not retry Replit-managed AI setup unless the user explicitly changes this choice.
