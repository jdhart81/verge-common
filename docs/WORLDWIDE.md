# Worldwide adoption

Verge Common is open-source infrastructure for locally governed conservation groups anywhere. No US address or legal entity is assumed. Each co-op chooses a country or territory and accounting currency; local organizers supply the applicable legal and ecological rules.

## Organizer path

1. Create a co-op with your country, region, currency, and member name.
2. Add a project and use the Start checklist. Projects may be member-only or public; parcel records remain private.
3. Search for organizations by country or region. Search links are external; the US land trust directory is explicitly regional. Listed organizer profiles are self-reported, not verified partners.
4. Generate single-use invitations and share them privately yourself. They expire in seven days, can be revoked, and create pending membership requests. Stewards approve access separately. Hosted-site access may also need approval.
5. Enter each parcel in hectares, acres, or square metres. Conversion rounds to the nearest whole square metre; this is recorded area, not a surveyed boundary or carbon estimate.
6. Record a selected program and methodology version, official reference, documented area threshold, compatibility assessment, and unresolved requirements. Only reviewed parcels enter this snapshot. A second steward reviews it. New land or rules require a new assessment.
7. Use the payout illustration to discuss member shares, stewardship costs, and reserves. Enter the agreed policy in a proposal and hold a member vote. Actual allocations use adopted policy and reviewed settlement records.

## Currency and legal boundaries

Each co-op has one accounting currency. Supported currencies come from the runtime's internationalization data. Zero, two, three, and other supported decimal precisions use integer minor units. Historical schema names such as `cents` and `grossCents` mean minor units of the co-op currency; for legacy co-ops the currency is USD. Currency becomes immutable after the first settlement, including rejected records. No FX conversion, mixed-currency aggregation, bank transfer, or tax calculation is performed.

Legal entity, easement, tenure, customary rights, consent, credit ownership, taxation, and distribution rules vary by jurisdiction. The open templates are review aids. They are not universal legal instruments. Organizers must obtain applicable local review and external execution.

Pooling acreage alone is insufficient for carbon eligibility. See [Verra's grouped-project process](https://verra.org/programs/verified-carbon-standard/grouped-projects/) for an example requiring eligibility criteria, geographic boundaries, validation, and verification. The software does not encode every methodology or certify compliance.

## Run it from GitHub

`npm run launch` installs locked dependencies, applies local migrations, and starts a local trial. Never expose that development service to the public. Stop with Ctrl+C; local records remain on the device under the ignored `.wrangler` folder.

Production needs a Worker-compatible host, D1-compatible database, private object storage, and a trusted identity gateway. See OPERATIONS.md. GitHub hosts source and collaboration; GitHub Pages alone cannot run the shared database, private uploads, or membership system. Deployment and account provisioning still require the operator's configuration; this release does not claim a universal one-click production installer.

## Localization and adoption limits

The interface is currently English. Names, regions, organization text, and project records accept Unicode. Number and date displays use the browser locale. Translation packs, right-to-left interface testing, localized legal templates, low-bandwidth/offline synchronization, verified organization claims, production abuse controls, and multi-region data residency are future work. Hosting in one region is not a promise of local data residency worldwide.

Start with actual local organizers and shareable project activity. Public availability, installations, and invitations are not evidence of active stewardship, retained membership, or viral growth.
