# Verge Common

**Care for a place. Build a commons.**

Verge Common is an open-source project for neighbors who want to care for the places they share. We are releasing the code for the mission: communities should be able to understand, adapt, and carry their tools forward.

[Website](https://verge-common-community.jdhart.chatgpt.site) · [Try the planner](https://verge-common-community.jdhart.chatgpt.site/demo/) · [Contribute](CONTRIBUTING.md) · [Roadmap](ROADMAP.md)

## What works today

- Create one place card with a name, general area, and purpose.
- Add actions, mark them complete, and record observations.
- Save on your device using browser storage.
- Download a JSON copy and copy an invitation to share yourself.
- Run the website locally or host its static output.

**This is an early, device-local community edition.** It is not a shared neighborhood network. There are no accounts, shared database, live member counts, payments, carbon issuance, or certified ecological claims. Clearing browser storage removes the saved plan. JSON export is a backup; import is not implemented yet.

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

Plans stay in browser storage until you copy or download them. The invitation includes the place, general area, purpose, and unfinished actions, but excludes notes. A downloaded JSON file includes notes. Do not enter sensitive parcel locations, personal contact details, or other private information. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

This repository contains the clean public community edition. It does not include the separate private application, internal research, formal proof candidates, production records, or credentials. The project makes no certification or carbon-credit eligibility claim.

## License

Original project code is licensed under **GNU AGPL v3.0 only**. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Dependency code retains its own licenses. The Verge Common name and marks are not licensed for implying endorsement. Forks are welcome; identify them clearly.
