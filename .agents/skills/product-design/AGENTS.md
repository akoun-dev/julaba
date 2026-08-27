# product-design — Agent Instructions

## Load Order

1. Read this file (`AGENTS.md`) first for governance and validation rules.
2. Read `SKILL.md` for the operating contract, request modes, and workflow.
3. Route to the appropriate `references/` files based on the surface and need.
4. Consult `exemplars/` for accepted decisions on similar work.

## When to Load

This skill activates when any of these conditions are met:

- The task modifies a user-facing component, screen, or flow.
- The task involves copy, interaction, accessibility, or responsive behavior.
- The task is a review, audit, or polish pass on shipped UI.
- The task adds a new screen or module to any of the three surfaces (marchand, identificateur, backoffice).

## Validation

After completing work under this skill, the agent MUST:

1. Report which surfaces and references it loaded.
2. Cite the canonical source for each material decision.
3. Verify all reachable states of the changed surface.
4. Run `bun run lint` and resolve any new errors in the changed files.

## Governance

- **Adding a rule:** Requires evidence from shipped code or a verified user problem. Write the rule with a stable ID, scope, rationale, bad/good examples, and exceptions. Add to the narrowest relevant reference file.
- **Changing a rule:** Requires a new decision record that supersedes the old one. Preserve the old record with `Status: superseded` and a link to the replacement.
- **Removing a rule:** Requires evidence that the rule causes more harm than value. Record the removal with rationale.
- **Coverage gaps:** When no standard exists for a surface or decision, add an entry to `references/coverage-gaps.md` rather than guessing.

## File Map

```
product-design/
├── AGENTS.md              # This file — governance and load order
├── SKILL.md               # Entry point — operating contract, modes, workflow
└── references/
    ├── product-judgment.md   # Product decision framework and role-specific context
    ├── interface-quality.md  # Visual, interaction, accessibility standards
    ├── copy.md                # Language, terminology, tone
    ├── patterns.md           # Component usage, layout, styling conventions
    ├── surfaces.md           # Surface routing — which files for which role
    ├── surfaces-marchand.md  # Marchand-specific decisions
    ├── surfaces-identificateur.md  # Identificateur-specific decisions
    ├── surfaces-backoffice.md      # Backoffice-specific decisions
    ├── rules.md              # Stable rule index with IDs
    ├── glossary.md           # Product vocabulary (French)
    └── coverage-gaps.md      # Areas without a standard yet
```
