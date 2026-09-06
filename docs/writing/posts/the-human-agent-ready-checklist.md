---
authors:
  - nam
categories:
  - Notes
comments: false
date: 2026-09-06
description: Seven checks for whether an agent can find you, see you, act without
  breaking things, and leave the human in charge.
draft: false
slug: the-human-agent-ready-checklist
tags:
  - agents
  - accessibility
  - apis
---

# The Human + Agent Ready Checklist

Score yourself. 0 means the surface is human-only. 1 means it is fixed for
agents.

<!-- more -->

## 1. Discovery: can an agent find you?

- `llms.txt` at root, with a plain-English description of what your product
  does, plus links to docs and your MCP endpoint
- `/api/agent-manifest.json` listing your MCP server URL, tools, rate limits,
  and pricing
- A live MCP server exposing at least three tools: search, get_details,
  create/update. Every NLWeb instance also acts as an MCP server, publishing
  your content and query interface to the agent ecosystem
- Traditional SEO still working. Sitemap, structured data, canonical URLs.
  Agents still fall back to crawling

The cheap win here is `llms.txt`. It takes an afternoon and costs nothing. The
manifest and the MCP server are the real work, and they are what determine
whether an agent treats you as a capability or as a page to scrape.

## 2. Interface semantics: can an agent see you?

This is the number one failure mode in 2026, and it is the section people skip
because it feels like an accessibility chore rather than a product problem.

- No div soup. Every interactive element is a `<button>`, `<a>`, `<input>`,
  `<select>`, or `<label>`. Native elements like `<button>`, `<label>`,
  `<nav>`, and `<main>` build a useful accessibility tree for free
- Labels are linked. Every input has `<label for="id">`. Browser-agent UX
  fails without it
- Accessibility tree audit passes. Run `page.accessibility.snapshot()`. That
  is what browser-use, the 85k-star open-source agent framework, calls as its
  primary observation method. If it comes back empty, agents are blind
- Tested with Playwright MCP. Microsoft Playwright MCP reads the accessibility
  tree rather than taking pixel-based input. OpenAI Atlas, Playwright MCP, and
  Perplexity's Comet all rely on accessibility data
- No visual-only state. Loading, error, and success live in DOM text, not in a
  color change or a toast that vanishes after three seconds

The accessibility tree is the literal interface AI agents use to understand
your website. Not your design system. Not your hero image. A stripped-down
structural model that has powered screen readers for twenty years and that
most teams have never opened.

Run the snapshot on your checkout page right now. I have watched more than one
team go quiet when they saw the result.

## 3. Actions and APIs: can an agent act without breaking things?

- Every UI action has a matching API or MCP tool. Agents consume APIs,
  schemas, and structured models. They do not consume tooltips and dashboards
- Idempotency keys on all create actions. `Idempotency-Key: agent_request_123`
  is what stops a retry loop from placing four orders
- Machine-readable errors. JSON with `code`, `message`, `retryable`,
  `retry_after`. Not "Something went wrong"
- Deterministic selectors. `data-testid="checkout-pay-button"` that survives a
  redesign
- No CAPTCHA for agents. Humans get the CAPTCHA. Agents get a signed token or
  a proof-of-work endpoint

Idempotency is the one I would fight for hardest. Humans double-click and feel
embarrassed. Agents retry on a timer, and they do not feel anything at all.

## 4. Auth and permissions: who is the agent acting as?

- Separate agent identity. The agent authenticates as
  `agent:{user_id}:{agent_name}`, not as the human
- Scoped, short-lived tokens. `orders:read`, `orders:create`. Never `*:*`.
  Someone has to own token lifecycle, or agents accumulate permissions the way
  shared service accounts always have
- Categorised agent types. Personal agents belong to one user.
  Organisational agents are shared and effectively ownerless, which makes them
  the highest-risk category, and they should require owner approval
- Revocation UI. A human can see "3 agents have access" and kill any of them
  in one click

If your answer to "who did this" is the human's user ID, you have no audit
trail. You have a story.

## 5. Trust, control and transparency: is the human still in charge?

- The agent identifies itself in every user-facing log. "Perplexity Comet
  booked this for you"
- Confirmation gate on high-stakes actions. Agents should say plainly that
  they are AI, cite where information came from, ask before doing anything
  expensive or irreversible, and hand off to a human when they are stuck
- User-visible summary before execution. "I will book flight X for $420", with
  one-click undo
- Citations and provenance in agent output
- A handoff protocol. When the agent fails, it passes the transcript and
  context to human support instead of saying "I can't help with that"

This section is also your legal surface. An agent taking consequential action
with no visible trail is a governance problem before it is a UX problem, and
the people who will care about it are not on your product team.

## 6. Resilience and ops: what happens when agents hammer you?

- Separate rate limits. Humans at 60 rpm, agents at 600 rpm, metered and
  billed
- An agent traffic dashboard. You can see what share of traffic comes from
  Operator, Claude computer use, and Comet
- No breaking UI changes without an API version bump. A frontend redesign
  should not take your MCP tools down
- Shadow mode. You can run agent traffic dry and see what it would have done

Most teams discover their agent traffic mix during an incident. That is a bad
time to build the dashboard.

## 7. Metrics: are you measuring the second user at all?

- Agent success rate per flow (search, add, checkout), tracked separately from
  human conversion
- Time to first tool call. How fast can a brand new agent get from discovery
  to a successful action?
- Agent-initiated revenue. Actual dollars attributed to agent users

If agent conversion is folded into your human funnel, you cannot see the
failure. You will see a slightly worse number and blame the redesign.
