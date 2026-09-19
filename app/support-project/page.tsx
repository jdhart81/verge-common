import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { InformationPage, documentBranch } from '@/components/information-page';
import { projectSupport } from '@/lib/project-support';

export const metadata: Metadata = {
  title: 'Support the project · VergeCommon',
  description:
    'Help sustain open-source community conservation tools through feedback, contributions and project support.',
};

export default function SupportProjectPage() {
  return (
    <InformationPage
      title="Help keep common ground growing."
      intro="Open-source conservation needs people who care for the tools, too. Help us make VergeCommon useful to more communities."
    >
      <section className="information-highlight">
        <h2>Optional project support</h2>
        <p>
          VergeCommon is a {projectSupport.operator} project. Voluntary
          contributions help fund hosting, maintenance and development of the
          shared conservation tools. The website’s public beta is free to use.
        </p>
        {projectSupport.stripePaymentLink ? (
          <>
            <a
              className="button primary"
              href={projectSupport.stripePaymentLink}
            >
              Contribute with Stripe{' '}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <p>
              You will continue to Stripe’s hosted payment page to review the
              contribution amount and payment terms before paying. Payment
              details are handled by Stripe and are not entered into your co-op
              workspace.
            </p>
          </>
        ) : (
          <p>
            Online contributions are not open yet. For now, you can support the
            project by sharing practical feedback or contributing to the
            open-source tools below.
          </p>
        )}
        <p>
          Project support goes to Viridis LLC, and no charitable tax receipt is
          offered. It is not a purchase of carbon credits or land rights, or an
          investment. Contributions do not buy priority access, influence over
          co-op decisions or a share of future payouts.
        </p>
      </section>
      <section>
        <h2>Bring what you know</h2>
        <ul>
          <li>
            <strong>Try one real workflow:</strong> tell us where a conservation
            group gets stuck, what is unclear, or what would make field work
            easier.
          </li>
          <li>
            <strong>Improve the commons:</strong> contribute code,
            documentation, accessibility reviews or conservation knowledge
            through the{' '}
            <a href={documentBranch + '/CONTRIBUTING.md'}>contributor guide</a>.
          </li>
          <li>
            <strong>Build a local connection:</strong> invite a willing neighbor
            or conservation practitioner to explore a project with you.
          </li>
        </ul>
      </section>
      <section>
        <h2>Project funding and co-op funds are separate</h2>
        <p>
          A contribution here supports the VergeCommon software project. It does
          not fund a particular co-op, establish a conservation partnership, or
          create a carbon-payment entitlement. Co-ops agree their own
          responsibilities and financial arrangements with qualified partners.
        </p>
        <p>
          For help with a contribution or the beta,{' '}
          <Link href="/support/#contact">contact the project</Link>. Please do
          not post payment or account details in a public GitHub issue.
        </p>
      </section>
    </InformationPage>
  );
}
