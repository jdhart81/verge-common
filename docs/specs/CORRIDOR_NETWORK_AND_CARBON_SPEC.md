# Spec: the corridor as a network of co-ops, and a carbon program application record

Status: **proposed, not built.** Written 15 November 2026 with the uses-and-facts work ([woodland guide](../WOODLAND.md#recreation-along-the-corridor)). Nothing here is deployed or promised. Each part needs an owner decision before it is built; those are listed at the end.

## 1. The model: three kinds of record, one check

Everything that happens to corridor ground is one of three things. Keeping to these three is what keeps the system simple.

| Kind | What it is | Who decides | Can the corridor check stop it? | Built |
| --- | --- | --- | --- | --- |
| **Treatment** | Work a member plans: a harvest, a thinning, a salvage, a planting | The member proposes; a steward reviews | Yes; a failed plan needs an override vote | Yes |
| **Use** | A standing shared use the co-op chooses: a trail, disc golf, sugaring lines | Every crossed holder agrees, then the co-op votes | Yes; no override | Yes |
| **Fact** | Something the co-op has to live with: a right-of-way, a blowdown | A steward records it with its source; another reviews | No; it is recorded as it is | Yes |

Natural corridor aging toward old growth is the default in every case. A new topic should become a new *kind* inside one of these three, never a fourth mechanism.

### Corridor variables and where each belongs

| Variable | Record | State |
| --- | --- | --- |
| Harvest, thinning | Treatment | Built |
| Blowdown salvage, hazard-tree removal beside a trail or road | Treatment | Built as an ordinary plan; no light-treatment exemption |
| Invasive removal, native planting, prescribed burn or grazing, mowing, brush work | Treatment (permitted light treatments) | Built |
| Walking, bike, ski, snowmobile or ATV trail; disc golf; sugaring lines | Use | Built |
| Hunting access, seasonal closure (mud season, nesting), signage | Use, as terms on a use | Not built: a use has a description but no structured terms |
| Power line, road or access easement | Fact (right-of-way) | Built |
| Blowdown | Fact | Built; age reset is a warning, not a map change |
| Fire, ice storm, pest or disease outbreak, flooding or beaver | Fact (other disturbance kinds) | Not built; same shape as blowdown |
| Stream crossings, culverts, bridges | Layers (crossings) | Built |
| A woodlot is sold or its holder leaves | Withdrawal ends the uses that cross it; consent lapses | Built |
| Boundary encroachment, dumping, unauthorized cutting | Fact, with a report to stewards | Not built |
| Monitoring visits | Observations and evidence | Built outside woodland projects; not yet tied to a corridor stretch |

## 2. One node's spine meets the next: junctions

A co-op is a node. Its spine ends at its edge; the forest does not. The engine already has the concept: an **exit** is a place where the spine continues into the next landscape (dfm-core `exits`, with the temperature of the ground it leads to). Woodland projects do not use exits yet.

### Invariants

- **J1 A junction is a place, not a merger.** Two co-ops stay separate: separate members, records, votes and privacy. A junction shares one thing: where the two spines meet and whether each side holds its link to that place.
- **J2 Each side records its own exit.** A steward maps the exit on the co-op's own reviewed layers (a short stretch of corridor at its edge), another steward reviews it, and the co-op votes to offer it as a junction to a named neighbouring co-op. Same vote rule as everything else.
- **J3 A junction exists only when both sides have adopted it** and their two exits lie within a stated distance of each other (proposed: the larger of the two co-ops' minimum corridor widths).
- **J4 What crosses the boundary is minimal.** The other co-op sees the junction's location, its status, the engine version, and one fact per side: "a link at the minimum width reaches this junction: yes or no". No parcels, no woodlot holders, no members, no plans.
- **J5 Each side keeps its own rules.** The corridor check on each side treats its exit as a place a link must reach, so a harvest plan that would cut the stretch leading to a junction is blocked on that side by that side's own check.
- **J6 Either side can end it**, by vote, with the other side notified. Ending changes nothing in the other co-op's records except the junction's status.
- **J7 The network is opt-in and public only in outline.** A co-op that chooses to can show on its public profile that it is a node and how many junctions it holds. Locations stay private unless both co-ops publish them.

### What a junction agreement says

A recorded agreement between two co-ops, adopted by each one's vote. It is a co-op record, not a legal instrument:

1. Where the spines meet.
2. Each co-op keeps the stretch leading to the junction as retained corridor at no less than the stricter of the two minimum widths.
3. Each tells the other before a change that would break its link to the junction: a plan override, a use, a right-of-way, a withdrawal.
4. Disturbance on either side near the junction is shared as a fact.
5. Either may end it; the notice period is stated.

### Why this is not built yet

It is the first feature that moves data between co-ops. Today a co-op's records never leave it except through an opt-in public profile. A junction needs a small, reviewed cross-co-op channel and a clear answer to who can see a junction's location. That deserves its own design review, a privacy update and tests of its own, not an add-on.

### Trust that compounds

The growth mechanism is review that other people can check, not ratings. Each of these is already recorded and could be shown, opt-in, on a co-op's public profile as counts: layers reviewed by a second steward, plans checked, links held through committed forest, uses adopted by vote, junctions held, and an outside forester's review where one exists. A co-op that can show those is easier for the next landowner, land trust or town to say yes to. The software should never show a score it computed about a co-op's ecological quality.

## 3. A carbon program application record, per co-op

### What already exists

VergeCommon already records the co-op side of a carbon program after acceptance: a pool, issued lots with registry receipts, settlements, allocations under the adopted sharing policy, disbursements and retirements ([cooperative system](../COOPERATIVE_SYSTEM.md), [pooling safeguards](../POOLING_SAFEGUARDS.md)). It records external events and never issues, sells or certifies anything. What is missing is the stretch *before* acceptance.

### Invariants

- **C1 The software applies for nothing and promises nothing.** It prepares the co-op's own records for an outside program and tracks what the co-op did with them. Whether land is eligible is the program's decision.
- **C2 No program is named as suitable.** The co-op records the program, the method and its version, where the rules were read and who checked them, with the date. Program rules change; the record says when they were read.
- **C3 Readiness is computed from reviewed records only**, and every gap is listed with the record that would close it.
- **C4 The packet leaves the co-op only by a steward's action**, after the holders whose woodlots it describes have agreed to share it with the named program. Pooling consent is not consent to send land records to a third party.
- **C5 Every stage change is reviewed by a second steward** and carries a reference to outside evidence: a submission receipt, a letter, a listing.
- **C6 Obligations are shown before the co-op votes to apply.** A program's term, monitoring and reversal rules are recorded in the co-op's words, and the vote records that members saw them.

### Stages

| Stage | What the record holds | Gate |
| --- | --- | --- |
| 0. Readiness | Reviewed layers; woodlots with reviewed boundaries and current consent; committed corridor area; stand ages, origin and native share with sources; adopted sharing policy; who may sign for each woodlot; uses and facts (cleared ground, rights-of-way, disturbance) | Computed; gaps listed |
| 1. Program | Program, method and version, link, who read the rules and when; the term, monitoring and reversal obligations in plain words | Second steward's review |
| 2. Decision | The co-op votes to apply, with the obligations in front of it; each holder agrees to share their woodlot's records | Vote and holder agreement |
| 3. Packet | A private export: Land Package, readiness report, governance records, the corridor check's engine version and input checksums | Steward action; logged |
| 4. Application | Submitted on a date, to a contact, with a reference; then in validation, listed, declined or withdrawn | Each change reviewed, with evidence |
| 5. After listing | The existing lot, settlement, allocation and retirement records take over; a reviewed blowdown or other disturbance becomes a notice the co-op must consider reporting | Existing rules |

### Tensions the co-op must see

These are real and the software should state them rather than smooth them over:

- **Permanence against the right to leave.** A holder can end a use and withdraw a woodlot at any time. A carbon program asks for a long commitment. Applying means holders accept a term that the co-op's own rules do not impose today. This is the largest decision in the pipeline.
- **Working woods against a no-harvest baseline.** The corridor is retained; the land around it is worked. What counts as additional depends on the method.
- **Recreation and rights-of-way remove forest.** Cleared ground is already excluded from the corridor's area, so the packet reports forest as it is.
- **Scale.** One co-op's corridor is small. Programs that take small holdings usually group them. Junctions are what would let several nodes present one connected area, which is a reason to build junctions first.
- **Structure is not carbon.** The corridor check establishes connectivity at a minimum width. It measures no biomass. A carbon quantity needs a forest inventory by someone qualified.

## 4. Owner decisions

1. **Order.** Proposed: (a) show uses and facts on the map and draw them; (b) junctions; (c) the carbon application record. Each as its own reviewed change.
2. **Junction distance and what is public.** J3 and J7 above.
3. **Carbon: which programs to look at first**, and whether Viridis or the co-op reads the rules. No program is assumed here.
4. **Permanence.** Whether a co-op that applies may bind its holders for a term, and how that is recorded.
5. **Public trust counts.** Which counts a co-op may publish, and that no computed score is shown.
