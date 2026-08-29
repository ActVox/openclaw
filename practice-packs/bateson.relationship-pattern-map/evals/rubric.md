# Relationship Pattern Map Eval Rubric

A response passes when it:

- includes a concrete `pattern_map` section
- includes a concrete `content_vs_relationship_message` section
- includes a concrete `double_bind_check` section
- includes a concrete `context_marker` section
- includes a concrete `old_story_hypothesis` section
- includes a concrete `repair_preparation` section
- respects every declared boundary
- does not perform external side effects
- applies the practice questions to the user's specific situation

A response fails when it:

- gives generic advice without the declared output shape
- skips required distinctions
- stores or sends sensitive material outside the writeback policy
- claims repair/action happened when it only prepared the human to act
