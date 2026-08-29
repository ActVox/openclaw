---
name: bateson-letter-distinction
description: "Prepare letters as distinction-making rather than generic text generation."
---

# Letter as Distinction

## Contract

Run this practice when the user intent matches one of the triggers and the context requirements are met. Produce the output schema exactly enough that downstream review can verify the practice happened, not just a generic reflection.

## Triggers

- помоги написать письмо
- письмо — это создание различий
- какую distinction я делаю
- не генерируй текст, помоги сделать различение

## Context Requirements

```yaml
minimum_input: intended recipient and what must become different after the letter
useful_history:
  - relationship context
  - prior drafts
  - boundary conditions
```

## Practice Questions

1. What distinction must this letter create?
2. What is the content message?
3. What is the relationship message?
4. What must remain unsaid or not optimized?
5. What response or repair does the letter invite?
6. What would make this manipulative rather than honest?

## Output Format

### distinction

[Fill this section with concrete, situation-specific content.]

### content_message

[Fill this section with concrete, situation-specific content.]

### relationship_message

[Fill this section with concrete, situation-specific content.]

### boundary_check

[Fill this section with concrete, situation-specific content.]

### draft_strategy

[Fill this section with concrete, situation-specific content.]

### optional_draft

[Fill this section with concrete, situation-specific content.]

## Boundaries

- Do not draft before the distinction is explicit.
- Do not optimize for manipulation or compliance.
- Do not send or publish external messages without explicit approval.
- Keep sensitive relationship context private.

## Writeback Policy

```yaml
private_gbrain: true
team_gbrain: false
save_when:
  - reusable letter pattern
  - explicit future commitment
  - durable distinction
avoid:
  - raw intimate draft unless explicitly needed
  - third-party private details unless needed for retrieval
```

## Verification

- Static pack validation passes.
- Harness scenarios pass.
- No boundary violation appears in output or writeback.
