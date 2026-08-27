# Working rules

- Read `docs/PROJECT_CONTEXT.md` before starting work.
- Before changing files, explain exactly what needs to change and why.
- For non-trivial work, propose a plan and wait for approval.
- Do not create, delete, or rename files without approval.
- Make only the changes included in the approved scope.
- Ask before adding dependencies or changing architecture.
- After implementation, list the files changed and checks performed.

## Documentation workflow

- Follow the EcoVoice-style learning documentation structure:
  - `docs/PRD.md` for product requirements and scope.
  - `docs/SupportLens_plan.md` for milestones, statuses, and measurable gates.
  - `docs/Milestones/Milestone_N_<Name>.md` for each implementation stage.
  - `docs/Research/Research_MN_<Topic>.md` for experiments, comparisons, and architectural decisions.
- Before coding a milestone:
  - Explain its goal, reason, planned work, concepts being learned, and pass/fail gate.
  - Present the implementation and documentation plan for approval.
  - Create or update the milestone document only after approval.
- During implementation:
  - Record meaningful experiments, alternatives, benchmark evidence, failures, and decisions in a research document.
  - Do not create research documents for trivial implementation details.
- After implementation:
  - Update the milestone with what was built, files affected, verification evidence, problems encountered, and lessons learned.
  - Mark a milestone complete only when its documented gate passes.
  - Keep the master plan's status synchronized.
- Documentation must capture real findings and decisions. Do not invent results or retroactively claim unperformed testing.

## Model workflow

- Prefer manual model selection by the user:
  - Use GPT-5.6 Sol for research, architecture, milestone planning, documentation, and final review.
  - Use GPT-5.6 Luna to execute an approved implementation plan and make application-code changes.
- Before changing application code, verify the active implementation agent is using `gpt-5.6-luna` when the runtime exposes that information.
- If the active agent is not Luna, the fallback is to delegate the approved implementation to a subagent explicitly using `gpt-5.6-luna`. The planning agent may coordinate and review the work but must not make the application-code changes itself.
- If a Luna implementation agent is unavailable, stop and ask the user to switch models or choose how to proceed. Do not silently fall back to another model.
- Do not claim that the active model changed unless the runtime confirms it. Spawning a Luna subagent does not change the planning agent's model.
