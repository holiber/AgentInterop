---
version: 0.3.0
icon: 📜
tags:
  - policy
  - governance
  - registry
title: Policy Definition and Specification
description: Defines what a policy is, how policies are structured, categorized, linked, and organized inside a policy registry.
---

Policy Definition and Specification

Purpose

This policy defines what a policy is, how it must be written, structured, categorized, and interpreted, and how policies are organized inside a Policy Registry.

Its goal is to ensure that policies are:
	•	Clear
	•	Minimal
	•	Deterministic
	•	Enforceable by humans and AI agents
	•	Consistent at scale across projects

⸻

What Is a Policy

A policy is a strict, authoritative contract that defines rules, constraints, or expectations.

Policies:
	•	Define what must or must not be done
	•	Govern behavior of humans and AI agents
	•	Are binding unless explicitly overridden by another policy

Policies are STRICT instructions, not recommendations by default.
If a rule is a recommendation, the policy must explicitly state this.

⸻

Policy Language
	•	Policies must be written in English unless explicitly stated otherwise in the policy registry index
	•	Language must be:
	•	Clear
	•	Explicit
	•	Deterministic
	•	Ambiguous or implied behavior is not allowed

Required wording conventions
	•	must / must not → mandatory rule
	•	should / should not → recommendation (must be explicitly stated)
	•	may → optional behavior

⸻

When a Policy Is Required

A policy (or policy change) is required when:
	•	Introducing a new rule or constraint
	•	Modifying existing rules
	•	Clarifying ambiguous or unsafe behavior
	•	Defining or changing AI agent behavior
	•	Changing execution, governance, or process rules

⸻

Proposal Requirement

All policy creation or modification must start with a proposal.

Rules:
	•	The proposal must use the proposal label
	•	Proposals may be created by humans or AI agents
	•	AI agents must follow contributing_ai_proposal
	•	A proposal must be reviewed before adoption

⸻

Policy Registry

A Policy Registry is a curated collection of policies applied together to one or more projects to serve specific goals.

The registry acts as:
	•	A database of policies
	•	A governance boundary
	•	A shared contract for humans and AI agents

⸻

Policy Registry Structure

Folder Structure
	•	The policy registry uses a flat folder structure
	•	No subfolders are allowed

policies/
  contribution_testing_strategy.md
  contribution_ai_index.md
  prepare-repo_tools.md
  prepare-repo_index.md
  index.md


⸻

Policy Categories and Subcategories

Policies belong to categories and optional subcategories, derived from the file name.

Naming rules

<category>_<subcategory>_<name>.md
<category>_<name>.md

Examples:
	•	contribution_testing_strategy.md
	•	category: contribution
	•	subcategory: testing
	•	prepare-repo_tools.md
	•	category: prepare-repo
	•	subcategory: tools

Category and subcategory names are semantic, not hierarchical folders.

⸻

Category Index Files

Each category must have an index file:

<category>_index.md

Example:
	•	prepare-repo_index.md

The category index:
	•	Explains the purpose of the category
	•	Defines what should and should not belong to the category
	•	May define rules that apply to all policies in the category

⸻

Registry Index File

The policy registry must have a root index file:

index.md

The registry index:
	•	Describes the purpose of the registry
	•	Defines global rules (e.g. default language)
	•	Explains how categories relate to each other
	•	Serves as the entry point for humans and AI agents

⸻

Core / Root Category

The root category of the registry must contain definitions of core entities, such as:
	•	Glossary
	•	Terminology
	•	Fundamental concepts used across policies

These definitions act as shared primitives for all other policies.

⸻

Policy Metadata (Optional)

A policy may include a YAML metadata header.

Supported fields
	•	version — policy version (default: 0.1.0)
	•	icon — single emoji
	•	tags — list of search tags
	•	title — human-readable title
	•	description — short summary
	•	meta — free-form object for non-standard fields

Defaults
	•	If title is missing → first heading is the title
	•	If description is missing → first paragraph after the first heading

Metadata must not override or weaken policy rules.

⸻

Policy Relationships

A policy may reference other policies using explicit relationship markers:
	•	[@see other_policy.md] — informational reference
	•	[@extends other_policy.md] — adds rules on top of another policy
	•	[@overrides other_policy.md] — replaces specific rules
	•	[@cancel other_policy.md] — explicitly cancels a policy

These relationships must be:
	•	Explicit
	•	Documented
	•	Non-ambiguous

⸻

Policy Structure

Recommended structure:

# Policy Title

## Purpose
## Rules
## Checklist (optional)
## Examples (optional)


⸻

Checklist Section

A policy may include a ## Checklist section.

Purpose:
	•	Provide a practical checklist
	•	Help ensure correct application of the policy
	•	Assist humans and AI agents during execution or review

Checklist items must not introduce new rules.

⸻

Field and Heading Case Rules
	•	All policy field names and headings are case-agnostic
	•	Examples:
	•	## Checklist == ## checklist
	•	Title == title

Unless explicitly stated otherwise, case differences must be ignored.

⸻

Approval and Safety Rules
	•	Policies must be reviewed before adoption
	•	Policies must not silently contradict each other
	•	Conflicts require a new proposal to resolve

⸻

AI Agent Constraints
	•	AI agents must not modify policy files directly
	•	AI agents may propose changes or clarifications
	•	Applying policy changes requires human approval

⸻

General Principles
	•	Policies are contracts, not recommendations by default
	•	Explicit rules are preferred over implicit intent
	•	Fewer clear policies are better than many unclear ones
	•	Clarity is more important than completeness
	•	If a policy cannot be followed reliably by an AI agent, it must be revised
