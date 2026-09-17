# Contributing to Verge Common

Thank you for helping communities care for their places.

## Start with something useful

- Review the cooperative system design with landowners, land trusts, EcoHedge organizers, and co-op practitioners.
- Improve the agreement intake/review scaffolds without presenting drafts as executed instruments.
- Test quantity accounting, member allocation edge cases, and future custody/settlement controls.
- Try the workbench and describe one confusing step.
- Improve keyboard navigation, readability, or screen-reader support.
- Suggest clearer wording or contribute a translation approach.
- Add a focused improvement from the roadmap with a small reproducible example.

Open an issue before a large change so we can agree on scope. An issue is public: do not include private locations, personal details, credentials, or participant records.

## Three small starting tasks

These are suggested contributions, not assigned or completed work. Check existing issues first, then propose a focused change with the [contribution proposal form](https://github.com/jdhart81/verge-common/issues/new?template=contribution.yml).

1. **First-run walkthrough:** follow the README from a fresh clone using synthetic data. Report your OS, Node version, the first confusing step, and a proposed wording fix. Done when another newcomer can follow the revised step.
2. **Keyboard and mobile review:** try the local planner and boundary editor. Report the route, steps, expected behavior, and observed barrier without personal or location data. Done when the barrier is fixed and the same interaction is checked again.
3. **Conservation workflow review:** read the monitoring guide and identify one missing consent, uncertainty, or field-evidence requirement. Propose a documented example without claiming certification. Done when the maintainer and a relevant practitioner can review the rationale.

See [community conduct](CODE_OF_CONDUCT.md). A first contribution can be a clear issue or documentation improvement; code is optional.

## Development

1. Fork the repository and create a branch.
2. Use Node 22.13+ and run `npm ci`, `npm run db:migrate:local`, then `npm run dev`.
3. Make a focused change. Add tests when behavior or privacy boundaries change.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Open a pull request explaining the problem, resulting behavior, and validation.

Keep the authentication boundary explicit. Never add a production development-user fallback or accept caller-supplied identity headers from an untrusted origin. Do not add tracking, advertising, external data collection, or invented activity metrics. Treat exact locations and field evidence with care. Do not describe an observation as a verified ecological outcome.

## Contributions and governance

Contribute only work you have the right to submit. Contributions to the project are accepted under AGPL-3.0-only unless explicitly documented otherwise. Preserve notices for third-party work.

Justin Hart maintains this initial release and makes merge and release decisions. We welcome public discussion of the roadmap. This is a maintainer-led software project; it does not claim community legal ownership or a functioning cooperative governance structure.

## Community conduct

Be respectful, specific, and constructive. No harassment, discrimination, doxxing, or publication of private locations. Maintainers may remove harmful content and restrict participation. Report security problems using SECURITY.md rather than public issues.
