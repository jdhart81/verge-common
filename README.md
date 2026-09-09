# Verge Common

**Open infrastructure for cooperative conservation.**

Verge Common is an open-source cooperative conservation system for EcoHedge projects and larger land parcels. We are releasing the code for the mission: communities should be able to understand, adapt, and carry their tools forward.

[Website](https://verge-common-community.jdhart.chatgpt.site) · [Try the planner](https://verge-common-community.jdhart.chatgpt.site/demo/) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

## The cooperative system

Verge Common applies the cooperative model to EcoHedge projects and larger conservation parcels: conservation commitments → reviewed evidence → compatible credit pools → settlement → transparent member payouts → continuing monitoring.

[Co-op workbench](https://verge-common-community.jdhart.chatgpt.site/coop/) · [Complete operating model](docs/COOPERATIVE_SYSTEM.md) · [Open agreement workflows](templates/)

## What works today

- Model EcoHedge and larger conservation projects, members, draft shares, and a compatible pool scope.
- Calculate ecological reserves, proposed sales, co-op budgets, and exact-cent member allocations.
- Reject oversales, invalid shares, incompatible scopes, unsafe quantities, and missing membership references.
- Export a scenario packet with modeled allocations and uncompleted agreement review records.
- Adapt open enrollment, easement review, and charter/payout policy scaffolds.
- Use the supporting local place/action planner at `/demo/`.
- Run or self-host the static website without service credentials.

**This is a cooperative system prototype, not a live credit or payment platform.** Workbench data lasts for the page session; export before leaving. It has no shared database, executed conservation agreements, registry connection, real cash settlement, or paid member dividends. Matching scenario scope labels do not establish program eligibility. The agreement scaffolds require authorized parties and jurisdiction-specific review; they are not ready-to-sign deeds.

The supporting `/demo/` planner separately saves one plan in browser storage. JSON export is a backup; import is not implemented yet.

## Run locally

Use Node.js 22.13 or later and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed in the terminal. No API keys, paid services, database, or hosting account are required.

## Check and build

```sh
npm test
npm run typecheck
npm run build
```

The production website is exported to `dist/client/`. Deploy that directory to a static host with directory-index support. To preview a build locally:

```sh
python3 -m http.server 8080 --directory dist/client
```

The `.openai/hosting.json` file identifies the official Sites deployment. Forks should remove its `project_id` or use their own Sites project; it is not a credential and does not grant publishing access. Any static host can serve the exported site without that file.

## Help the mission

Try one small action with a place you care about. Tell us what helped, what was confusing, and whether you used it again. Please share only information you have permission to make public.

Useful contributions include accessibility improvements, translations, documentation, and small fixes. See [CONTRIBUTING.md](CONTRIBUTING.md). Success means useful repeated local action; downloads and stars alone do not establish that.

## Privacy and scope

Co-op scenarios remain in page memory until exported. The supporting local planner stores its plan in browser storage. The invitation includes the place, general area, purpose, and unfinished actions, but excludes notes. A downloaded JSON file includes notes. Do not enter sensitive parcel locations, personal contact details, or other private information. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

This repository contains the clean public community edition. It does not include the separate private application, internal research, formal proof candidates, production records, or credentials. The project makes no certification or carbon-credit eligibility claim. The platform takes no percentage of co-op credit sales.

## License

Original project code is licensed under **GNU AGPL v3.0 only**. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Dependency code retains its own licenses. The Verge Common name and marks are not licensed for implying endorsement. Forks are welcome; identify them clearly.
