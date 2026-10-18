# Project documentation

Use this index to find setup instructions and project references. For application code and local development, start with the [repository README](../README.md).

## Setup and operations

- [Product requirements document](PRD.md): repository-derived goals, scope, priorities, metrics, and rollout.
- [System architecture](system-architecture.md): application components, managed services, and request flows.
- [Environment setup](development/environment-setup.md): local and hosted environment variables.
- [Deployment runbook](operations/deployment-runbook.md): production services and release checks.

## Guides

- [Admin payment approval](guides/admin-payment-approval.md): payment approval states and workflow.
- [Admin dashboard and storefront data](guides/admin-dashboard-and-storefront.md): dashboard values and storefront data flow.

## Security

- [Authentication security audit](security/authentication-audit.md): recorded findings and verification notes.
- [Payment security architecture](security/payment-security-architecture.md): payment validation and threat scenarios.
- [Database and password security](security/database-and-passwords.md): database role setup, password policy, and secret handling.
- [Runtime database role SQL](security/supabase-runtime-role.sql): grants and policies for the application database role.

## Plans and analysis

These documents record proposed work or point-in-time analysis. Check the current implementation before treating a proposal as an implemented behavior.

- [Payment flow upgrade plan](plans/payment-flow-upgrade.md)
- [Production upgrade plan](plans/production-upgrade.md)
- [Product detail analysis](analysis/product-detail-analysis.md)

## Editor instructions

Tool-specific instructions stay at the paths expected by each editor: [`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md), and [Copilot instructions](../.github/copilot-instructions.md). Installed agent skills are local developer files and are not tracked in this repository.
