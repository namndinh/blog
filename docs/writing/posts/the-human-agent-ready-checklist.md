---
authors:
  - nam
categories:
  - Notes
comments: false
date: 2026-09-06
description: Seven places the second user — an AI agent — hits a wall, and
  why almost none of the fixes are agent-specific work.
draft: false
slug: the-human-agent-ready-checklist
tags:
  - agents
  - accessibility
  - apis
---

# The "AI agent as a user" checklist

Our products now have a second user. It arrives through the same URLs, hits
the same endpoints, and fails in ways your analytics were never built to show
you. This checklist is seven places that second user hits a wall, roughly in
the order it hits them.

<!-- more -->

## But our agent traffic is ~1%

Fair. Mine too, on most properties. Two things make me keep working on it
anyway.

The first is that 0.3% is a measurement of how many agents got far enough to
be counted. If discovery fails, the agent never shows up in your logs at all.
You are not measuring demand, you are measuring the survivors.

The second is that almost nothing on this list is agent-specific work.
Semantic HTML, idempotency keys, machine readable errors, scoped tokens,
per-client rate limits: this is the backlog your senior engineers have been
quietly asking for since 2019. Agents just removed your excuse for not doing
it.

## 1. Discovery: can an agent find you?

- `llms.txt` at root, with a plain English description of what your product
  does, plus links to docs and your MCP endpoint
- `/api/agent-manifest.json` listing your MCP server URL, tools, rate limits,
  and pricing
- A live MCP server
- Traditional SEO still working because agents still fall back to crawling

## 2. Interface semantics: can an agent see you?

- No div soup because native elements build a useful accessibility tree for
  free
- Labels are linked because browser agent UX fails without it
- Accessibility tree audit passes
- Tested with Playwright MCP
- No visual only state

## 3. Actions and APIs: can an agent act without breaking things?

- Every UI action has a matching API or MCP tool
- Idempotency keys on all create actions e.g.
  `Idempotency-Key: agent_request_123` is what stops a retry loop from
  placing four orders
- Machine readable errors. JSON with clear schema. Not "Something went wrong"
- Deterministic selectors.
- No CAPTCHA for agents

## 4. Auth and permissions: who is the agent acting as?

- Separate agent identity
- Scoped, short lived tokens
- Categorized agent types
- Revocation UI

## 5. Trust, control and transparency: is the human still in charge?

- The agent identifies itself in every user facing log
- Confirmation gate on high stakes actions
- User visible summary before execution
- Citations and provenance in agent output
- A handoff protocol i.e. when the agent fails, it passes the transcript and
  context to human support instead of saying "I can't help with that"

## 6. Resilience and ops: what happens when agents hammer you?

- Separate rate limits e.g. humans at 60 rpm, agents at 600 rpm, metered and
  billed
- An agent traffic dashboard
- No breaking UI changes without an API version bump
- Shadow mode so you can run agent traffic dry and see what it would have
  done

## 7. Metrics: are you measuring the second user at all?

- Agent success rate per flow
- Time to first tool call
- Agent initiated outcomes

## Cheap wins and real work

| Section                 | Cheap win                                                                                   | Real work                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Discovery            | `llms.txt`. An afternoon, no budget, no ticket                                              | The manifest and the MCP server. These decide whether an agent treats you as a capability or as a page to scrape                              |
| 2. Interface semantics  | Linking labels to inputs. Find and replace, plus an afternoon of QA                         | Unpicking div soup in a mature component library, where half the buttons are styled `<div>`s because a designer wanted a hover state in 2021  |
| 3. Actions and APIs     | Structured error bodies. Your API already knows what went wrong, it is just refusing to say | Idempotency. It needs a key store, a replay policy, and a decision on how long you honour a key                                               |
| 4. Auth and permissions | Scoping the tokens you already issue. You probably have three permissions that matter       | The identity model. It changes your data model and is nearly impossible to retrofit once agent sessions look like human ones in your database |
| 5. Trust and control    | Naming the agent in the order confirmation email. One string                                | The confirmation gate. Someone has to define high stakes, and that argument goes to legal                                                     |
| 6. Resilience and ops   | Splitting the rate limit bucket. Your gateway supports this today                           | Shadow mode. A real engineering project, and the most useful thing on this list once you have it                                              |
| 7. Metrics              | One boolean on the session record marking agent traffic. Everything else follows from it    | Revenue attribution, once agents act for organisations rather than individuals and the buyer is no longer a person                            |
