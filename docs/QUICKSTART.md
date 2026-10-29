# Quickstart: run and check VergeCommon

Exact commands and the output you should see, for a researcher or reviewer who wants to confirm that VergeCommon builds, that its woodland corridor checks can be reproduced outside it, and that its co-op records behave as documented. Every command below was run from a fresh clone on Linux with Node 22.22.0 and Python 3.13. CI uses Node 24, and the [operator guide](../self-hosted/README.md) recommends Node 24.19.0 for a hosted instance.

What this shows: the software runs, gives the same answer every time, and stores corridor checks that the open-source engine reproduces exactly. What it does not show: any ecological outcome, species movement or verified conservation result. All data below is synthetic, and every money figure is a fictional rehearsal value. See [current status](../STATUS.md) for what is live.

## 1. Install and run the checks

```sh
git clone https://github.com/jdhart81/verge-common.git
cd verge-common
npm ci
npm test
npm run typecheck
npm run lint
```

Expected: `npm test` ends with `# fail 0` (388 tests). Clone without `--depth`: one test resolves the reviewed production baseline from git history and fails in a shallow clone. `typecheck` and `lint` print no errors.

## 2. Worked example: reproduce a woodland corridor check with the open engine

Woodland projects check each proposed harvest plan against the co-op's reviewed corridor layers with [`@viridis/dfm-core`](https://github.com/jdhart81/hdfm-framework), the MIT-licensed Dendritic Forest Management engine. A steward's **Download check inputs** gives the Landscape Package the plan was checked against. This example builds a synthetic co-op with one consented 100 ha woodlot and a two-unit harvest plan, stores VergeCommon's check, then checks the downloaded package again with dfm-core alone and compares the two.

```sh
node scripts/quickstart-example.mjs
```

Expected output:

```
Plan: Synthetic winter harvest, one consented 100 ha woodlot, two units
ok   engine                 dfm-connectivity-0.2.0
ok   input checksum         sha256:af1aae770551cf36ebd9ed3309991108ba0cd6d7ae9fef303e52ca702baba21b
ok   status                 fail
ok   lost links             core-A-core-B (harvest-3)
ok   pinched links          0
ok   committed corridor m2  72000.79
ok   proposed corridor m2   72000.69
VergeCommon and dfm-core agree. Matches docs/QUICKSTART.md
```

How to read it: the plan fails because harvest unit `harvest-3` cuts the only retained corridor between core areas A and B, so VergeCommon stores it as `blocked`. The input checksum is a SHA-256 of the package's canonical form, so anyone holding the package can confirm they are checking the same input. Corridor area counts as committed only where a holder's consent has been reviewed. The script exits non-zero if any value drifts. To keep the package, run `node scripts/dfm-contract-fixture.mjs > plan-package.json`; the [HDFM repository](https://github.com/jdhart81/hdfm-framework) tests that dfm-core reproduces this same package. See [woodland projects](WOODLAND.md) for the workflow and its limits: the checks are structural and do not establish species movement or old-growth condition.

## 3. Worked example: a co-op from setup to a recorded payout

An offline rehearsal of three fictional neighbours pooling land: mapping and consent, an allocation charter vote, a fictional credit sale, two-person reviews and reconciliation. Every step goes through the same domain command handler the service uses.

```sh
npm run simulate:coop
```

Expected output (your `outputDirectory` path will differ):

```json
{
  "classification": "FICTIONAL_OFFLINE_DOMAIN_SIMULATION",
  "successfulCommands": 110,
  "expectedDenials": 26,
  "areaHectares": 33.38373382872902,
  "memberAmountsCents": {
    "Maya": 56000,
    "Theo": 49000,
    "Nadia": 35000,
    "Lena": 0
  },
  "actualRevenueCents": 0,
  "outputDirectory": ".../outputs/coop-simulation/"
}
```

How the numbers follow: a fictional $2,000 settlement is split by the voted charter into 20% stewardship ($400), 10% treasury ($200) and a 70% member pool ($1,400). The pool is divided by each member's share, 40%, 35% and 25%, giving $560, $490 and $350. Lena is a partner representative with no share. The platform takes nothing. The 26 denials are actions the rehearsal attempts and the rules must refuse, such as a parcel's author approving their own parcel or a settlement being allocated twice. `33.38` ha is the geodesic area of the three pooled parcels. Full records are written to `outputs/coop-simulation/`. In `result.json`, only the generation time and one random member id change between runs. No money moves and no credit is issued: VergeCommon records external facts and reviews, it does not execute them.

## 4. Run the service locally and its acceptance checks

```sh
npm run build:selfhost
VERGE_DATA_DIR=/tmp/vergecommon-quickstart npm run start:selfhost
```

It prints `VergeCommon ready at http://127.0.0.1:3100`. Open that address to register a local account. In a second terminal, with the server running against that empty data directory:

```sh
python3 tests/selfhost_acceptance.py
```

Expected: three JSON lines, each starting `{"status": "passed"`. They cover independent accounts, invitation and access boundaries, evidence storage, token scopes and revocation, the hosted MCP endpoint, agent financial denial and account deletion. Use a dedicated empty data directory, and never expose this local server publicly.

## Cite this work

Citation metadata is in [CITATION.cff](../CITATION.cff). GitHub shows a "Cite this repository" button built from it. Please name the version or commit you used. If you use the corridor checks, please also cite [Dendritic Forest Management](https://github.com/jdhart81/hdfm-framework), whose engine performs them.

## Something did not match

Open an issue with the command you ran, your OS, Node and Python versions, and the output you saw. Do not include private locations or participant records.
