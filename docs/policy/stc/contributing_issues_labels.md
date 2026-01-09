# Ticket Types Policy

This policy defines how tasks (tickets) are created, labeled, structured, and executed within the project.
It explicitly accounts for the fact that tasks may be created and executed by AI agents as well as humans.

⸻

1. Ticket Labels

1.1 Research Tickets

Purpose
Research tickets are used for information gathering, exploration, and analysis.

Rules
	•	The ticket has the research label
	•	The main project code must not be modified
	•	Code experiments or prototypes may be created if necessary in docs/research
	•	The outcome is knowledge, not implementation

Deliverables
	•	If results are small → write them directly in the ticket
	•	If results are large → create a folder:

docs/ticket/:ticket_id/

containing:
	•	Markdown files with findings
	•	References, data, and experiments
	•	Any experimental code related to the research

Output Expectations
	•	Clear conclusions
	•	Actionable recommendations
	•	Explicit suggestions for potential code changes (if applicable)

⸻

1.2 Plan Tickets

Purpose
Plan tickets describe work that will later be split into multiple executable tasks.

They are often created after discussions (meetings, chats, brainstorming).

Rules
	•	The ticket has the plan label
	•	A Plan ticket may:
	•	Explicitly list future tasks, or
	•	Contain a high-level description or TODO list
	•	When a Plan ticket is processed (usually by an AI agent):
	•	All implied work must be converted into concrete tasks
	•	Missing task definitions must be inferred and created

Output Expectations
	•	A clear, structured list of tasks
	•	Tasks must be independently actionable
	•	Ambiguities should be resolved or explicitly documented

⸻

1.3 AI-Generated Tickets

Purpose
Marks tickets that were created by AI agents.

Rules
	•	The ticket has the aigenerated label
	•	The label is informational only
	•	AI-generated tickets follow the same quality standards as human-created tickets
	•	Humans may later refine, merge, or close them if needed

⸻

1.4 Epic Tickets

Purpose
Epic tickets represent large initiatives that consist of multiple tasks and are typically divided into Tiers.

A task qualifies as an Epic if it can be meaningfully split into staged delivery levels.

Rules
	•	The ticket has the epic label
	•	Epic work must be organized using Tiers (see below)

Recommended name for Epic subtasks

🧩 <ShortFeatureSlug> T<tier>_<order> <shortDescription>

Example

🧩 auth-flow T1_10 Add scenario tests


⸻

1.5 Bug Tickets

Purpose
Bug tickets describe incorrect, broken, or unintended behavior.

Rules
	•	The ticket has the bug label
	•	AI agents may create bug tickets only if they strictly follow
contributing_ai_reportabug
	•	Bug reports must be reproducible or clearly described

Expected Content
	•	Steps to reproduce (if applicable)
	•	Expected vs actual behavior
	•	Environment or context if relevant

⸻

1.6 Proposal Tickets

Purpose
Proposal tickets capture ideas and requests before execution decisions are made.

They may include:
	•	Feature requests
	•	Refactor proposals
	•	Optimization ideas
	•	Requests to fix or improve existing behavior

Rules
	•	The ticket has the proposal label
	•	AI agents may create proposal tickets
	•	AI agents must follow contributing_ai_proposal

Expected Content
	•	Problem or opportunity description
	•	Motivation and expected value
	•	Optional implementation ideas (non-binding)

⸻

1.7 Refactor Tickets

Purpose
Refactor tickets are used for improving code structure without changing external behavior.

Rules
	•	The ticket has the refactor label
	•	Functional changes are not allowed unless explicitly stated
	•	When assigned to an AI agent, it must follow
contributing_ai_refactor

Expected Content
	•	What is being refactored and why
	•	Expected improvements (readability, maintainability, performance, etc.)

⸻

1.8 Autoplan Tickets

Purpose
Autoplan tickets grant permission for an AI agent to perform automatic planning work.

This may include:
	•	Creating plan structures
	•	Creating sub-issues
	•	Creating research tickets

Rules
	•	The ticket has the autoplan label
	•	AI agents MUST NOT create or apply this label themselves
	•	The label is a human-granted permission
	•	AI agents must follow contributing_ai_autoplan

⸻

1.9 Autocode Tickets

Purpose
Autocode tickets grant permission for an AI agent to implement code automatically.

Rules
	•	The ticket has the autocode label
	•	AI agents MUST NOT create or apply this label themselves
	•	The label is a human-granted permission
	•	AI agents must follow contributing_ai_autocode

⸻

2. Epic Tiers

Tier 0 — Research & Planning (Optional)

Purpose
	•	Gather knowledge
	•	Define requirements for future tiers
	•	Reduce uncertainty

Rules
	•	The parent ticket has the epic label
	•	No requirement to finalize:
	•	Database choices
	•	Exact schemas
	•	Final architectures
	•	Examples are acceptable instead of decisions

Expected Outcomes
	•	Clear problem definition
	•	Constraints and assumptions
	•	Scalability expectations (e.g. MVP = 1,000 records, Release = 100,000 records)

Mandatory Final Task
	•	Create a Plan document (Markdown) used to generate tasks for subsequent tiers
	•	The document must include:
	•	Clear context (what and why)
	•	High-level approach
	•	Optional glossary

⸻

Tier 1 — MVP (Fast Value Delivery)

Purpose
	•	Deliver a working MVP as fast as possible

Rules
	•	Focus on:
	•	20% effort → 80% value
	•	Core or “killer” features
	•	Prefer simple and pragmatic solutions
	•	Mocked or simplified data is allowed
	•	Edge cases and scalability are not required

Mandatory Final Task
	•	Review Tier 1 findings
	•	Adjust Tier 2+ tasks based on new insights

⸻

Tier 2 — Alpha / Beta Quality

Purpose
	•	Make the solution fully usable

Rules
	•	No mock data
	•	Final UI/UX design applied
	•	All new functionality covered by tests

⸻

Tier 3 — Release Quality

Purpose
	•	Prepare the solution for release

Rules
	•	Code must be reviewed and tested again
	•	Verify all original requirements are met
	•	Remove duplicate or overlapping functionality

Mandatory Deliverables
	•	Documentation or specification
	•	Release notes text
	•	Code metrics (LOC, libraries, tests)
	•	At least one Human E2E Test for UI work

⸻

Tier 4 — Nice-to-Have (Post-Release)

Purpose
	•	Non-critical improvements and ideas

Examples
	•	Optional enhancements
	•	Experimental ideas
	•	Marketing or promotion tasks
	•	Tasks that may never be implemented

⸻

3. Notes on Tier Usage
	•	Not all Epics require all tiers
	•	Some Epics may be completed with only Tier 1–2
	•	Tiers exist to control complexity and decision timing, not to over-plan early

⸻

4. General Principles (For AI and Humans)
	•	Prefer clarity over perfection
	•	Make assumptions explicit
	•	Convert ambiguity into documented decisions or follow-up tasks
	•	Optimize for incremental value delivery
	•	Always leave the system in a better-documented state than before
