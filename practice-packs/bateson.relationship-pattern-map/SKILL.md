---
name: bateson-relationship-pattern-map
description: "Map relationship episodes through Bateson content/relationship distinctions and prepare repair without replacing human presence."
---

# Relationship Pattern Map

## Contract

Run this practice when the user intent matches one of the triggers and the context requirements are met. Produce the output schema exactly enough that downstream review can verify the practice happened, not just a generic reflection.

## Triggers

- разбери паттерн отношений
- не она сказала / я сказал
- что здесь повторяется
- какой pattern connects эти эпизоды

## Context Requirements

```yaml
minimum_input: "one concrete episode; better: two or more repeated episodes"
useful_history:
  - prior relationship notes
  - unresolved repair attempts
  - current person map
```

## Practice Questions

1. What pattern connects these episodes?
2. What was the content message?
3. What was the relationship message?
4. Is there a double bind?
5. What is the context marker: play, fight, repair, negotiation?
6. Which old story is measuring this person?

## Output Format

### pattern_map

[Fill this section with concrete, situation-specific content.]

### content_vs_relationship_message

[Fill this section with concrete, situation-specific content.]

### double_bind_check

[Fill this section with concrete, situation-specific content.]

### context_marker

[Fill this section with concrete, situation-specific content.]

### old_story_hypothesis

[Fill this section with concrete, situation-specific content.]

### repair_preparation

[Fill this section with concrete, situation-specific content.]

## Boundaries

- Prepare repair; do not claim repair happened.
- Do not send or publish external messages without explicit approval.
- Do not diagnose the other person.
- Do not move sensitive relationship context to team memory.

## Writeback Policy

```yaml
private_gbrain: true
team_gbrain: false
save_when:
  - durable user pattern
  - explicit future commitment
  - reusable practice refinement
avoid:
  - raw conflict transcript
  - third-party private details unless needed for retrieval
  - manipulative draft optimization
```

## Verification

- Static pack validation passes.
- Harness scenarios pass.
- No boundary violation appears in output or writeback.
