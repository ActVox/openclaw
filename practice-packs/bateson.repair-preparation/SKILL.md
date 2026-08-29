---
name: bateson-repair-preparation
description: "Prepare accountable repair without replacing presence, apology, or live contact."
---

# Repair Preparation

## Contract

Run this practice when the user intent matches one of the triggers and the context requirements are met. Produce the output schema exactly enough that downstream review can verify the practice happened, not just a generic reflection.

## Triggers

- подготовь repair
- как восстановить контакт
- как сделать repair после конфликта
- не заменяй присутствие

## Context Requirements

```yaml
minimum_input: what happened, user's part, other person's boundary if known
useful_history:
  - repeated conflict pattern
  - previous repair attempts
  - explicit commitments
```

## Practice Questions

1. What is the user's accountable part?
2. What boundary or hurt must be acknowledged?
3. What should be repaired in the relationship message, not only the content?
4. What is the smallest honest next step?
5. What must not be outsourced to the agent?
6. Is there a time-bound follow-up or reminder?

## Output Format

### accountability

[Fill this section with concrete, situation-specific content.]

### relationship_repair_target

[Fill this section with concrete, situation-specific content.]

### boundary_and_hurt

[Fill this section with concrete, situation-specific content.]

### next_human_step

[Fill this section with concrete, situation-specific content.]

### words_to_avoid

[Fill this section with concrete, situation-specific content.]

### optional_repair_note

[Fill this section with concrete, situation-specific content.]

## Boundaries

- Prepare repair; do not claim repair happened.
- Do not replace human presence or accountability.
- Do not send or publish external messages without explicit approval.
- Do not pressure the other person into response or forgiveness.

## Writeback Policy

```yaml
private_gbrain: true
team_gbrain: false
save_when:
  - explicit commitment
  - time-bound follow-up
  - reusable repair learning
reminders_when:
  - real follow-up date exists
avoid:
  - raw conflict transcript
  - third-party private details unless needed for retrieval
```

## Verification

- Static pack validation passes.
- Harness scenarios pass.
- No boundary violation appears in output or writeback.
