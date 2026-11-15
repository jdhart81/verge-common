import type { Metadata } from 'next';
import {
  InformationPage,
  accountRoutes,
  documentBranch,
} from '@/components/information-page';
import { projectSupport } from '@/lib/project-support';
import { woodlandEnabled } from '@/lib/woodland-config.mjs';
import { DFM_SITE_URL } from '@/lib/dfm-site.mjs';

// The page says what this service offers right now, so it reads the woodland flag per request.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Woodland corridors · VergeCommon',
  description:
    'Map the old-growth corridor that runs through your woods, then plan harvests that keep it connected while it ages toward old growth, with the open-source Dendritic Forest Management engine.',
};

const dfm = (path = '') => new URL(path, DFM_SITE_URL).href;

export default function WoodlandPage() {
  const open = woodlandEnabled();
  const contact = projectSupport.contactEmail;
  return (
    <InformationPage
      title="Work the woods. Keep them connected."
      intro="Map the old-growth corridor that runs through your woods, then plan harvests that keep it connected while it ages toward old growth."
    >
      <aside className="notice" data-woodland-open={open ? 'yes' : 'no'}>
        {open
          ? 'Woodland projects are open on this service as part of the public beta. Start with one woodlot and nonsensitive records while your group checks its corridor layers.'
          : 'Woodland projects are being tested and are not yet open on this service. You can read the method now and tell us about a woodlot that could be first.'}
      </aside>
      <section>
        <h2>What a woodland project does</h2>
        <ul>
          <li>
            The old-growth spine comes first. It follows streams, valleys and
            ridges and links a co-op’s old-growth candidates, riparian cores and
            reserves. The engine drafts its corridors from mapped stream and
            ridge lines, shows where one disturbance would still cut a link,
            projects which links run through forest at old-growth age as stand
            ages and consent accrue, finds routes toward cooler ground, and
            names the woodlots whose owners’ consent would complete the next
            link.
          </li>
          <li>
            Old growth here means the place’s own species. A plantation, or a
            stand recorded as mostly introduced species, is never projected as
            old growth, and planting inside a corridor is permitted only with
            native species.
          </li>
          <li>
            The corridor is natural by default. A co-op can vote to add a
            shared trail for walking or biking, or disc golf, on a mapped
            stretch, but only where the corridor still holds, and only with
            the agreement of every owner whose woodlot it crosses.
          </li>
          <li>
            Stewards map core areas, retained corridors, roads, open water and
            road crossings, with a minimum corridor width and where it comes
            from. Another steward reviews them before they are used.
          </li>
          <li>
            Every member’s harvest or treatment plan is checked against the
            reviewed corridors before anyone starts a saw. A plan that breaks a
            link is blocked; members can let it proceed only by a recorded vote,
            and another steward still reviews it.
          </li>
        </ul>
      </section>
      <section>
        <h2>What it does not establish</h2>
        <p>
          The check is structural: whether mapped retained forest of at least
          the minimum width links the same core areas after a plan as before.
          It does not establish that wildlife moves through a corridor, that
          populations stay genetically viable, that a stand is old growth or
          that a plan meets any regulation. Projections assume no fire, storm or
          new road. Stand age and origin are reported as recorded, never
          condition. Calling a stand old growth takes field evidence reviewed by
          someone other than the person who mapped it.
        </p>
      </section>
      {open ? (
        <section id="start">
          <h2>Start a woodland project</h2>
          <ol>
            <li>
              <a href={accountRoutes.register}>Create an account</a>, then
              create a co-op and invite the neighbors who share the woods.
            </li>
            <li>
              Add a project of the type <strong>Woodland (DFM corridors)</strong>.
              Draw the corridor layers, or upload a Landscape Package from the
              DFM mapping workspace or a forester’s GIS.
            </li>
            <li>
              Record each woodlot, its boundary and its holder’s pooling consent.
              A woodlot’s stretch of the spine counts as committed only after
              another steward reviews that consent.
            </li>
          </ol>
          <p>
            The <a href={`${documentBranch}/docs/WOODLAND.md`}>woodland guide</a>{' '}
            covers every step, limit and privacy rule.
          </p>
        </section>
      ) : null}
      <section id="first-woodlot">
        <h2>Have a woodlot that could be first?</h2>
        <p>
          The first season of{' '}
          <a href={dfm('unbroken/')}>Unbroken Woods</a> needs one owner or a
          small group of neighbors: woods you work, a harvest you are planning,
          and a willingness to have the corridor map and a forester’s review
          published. Exact boundaries stay private unless you choose otherwise.
        </p>
        {contact ? (
          <p>
            Email{' '}
            <a
              href={`mailto:${contact}?subject=${encodeURIComponent('Unbroken Woods woodlot')}`}
            >
              {contact}
            </a>{' '}
            with the town, the rough size of the woods and the harvest you have
            in mind. Leave out boundaries, parcel numbers and other private
            details until we talk.
          </p>
        ) : null}
      </section>
      <section>
        <h2>The open method</h2>
        <p>
          The corridor check and the spine come from{' '}
          <a href={DFM_SITE_URL}>Dendritic Forest Management</a>, an
          open-source (MIT) engine that anyone can run on the same data. Every
          result records the engine version and a checksum of its inputs.
          Woodland layers move between tools as a{' '}
          <a href={dfm('data-format/')}>Landscape Package</a>.
        </p>
      </section>
    </InformationPage>
  );
}
