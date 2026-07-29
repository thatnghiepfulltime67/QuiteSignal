# Work packages

This directory converts the architecture into reviewable implementation slices.
`Plan.md` owns cross-package status; each file here owns tasks, tests, and exit
criteria for one bounded stage.

## Rules

- Work packages run in numeric order unless a documented dependency permits otherwise.
- Only one package is active at a time.
- Each checked task should correspond to one small commit whenever practical.
- Split a task before implementation if it cannot be reviewed independently.
- Update risks and ADRs before accepting a change to privacy, custody, trust, or state.
- Media and presentation work is intentionally outside the active plan.
