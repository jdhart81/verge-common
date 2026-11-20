import { ArrowUpRight } from 'lucide-react';
import {
  RELATED_PROJECTS,
  VIRIDIS_SERVICES_HREF,
} from '@/lib/related-projects.mjs';

/** Footer row naming the related open projects and Viridis's separate services. */
export function RelatedProjects({
  label = 'Related open projects',
  servicesLabel = 'Old-growth corridor mapping from Viridis (separate service)',
}: {
  label?: string;
  servicesLabel?: string;
}) {
  return (
    <nav aria-label={label} className="related-projects">
      <span>{label}:</span>
      {RELATED_PROJECTS.map((project) => (
        <a key={project.href} href={project.href} rel="noreferrer">
          {project.name} <ArrowUpRight size={14} aria-hidden="true" />
        </a>
      ))}
      <a href={VIRIDIS_SERVICES_HREF} rel="noreferrer">
        {servicesLabel} <ArrowUpRight size={14} aria-hidden="true" />
      </a>
    </nav>
  );
}
