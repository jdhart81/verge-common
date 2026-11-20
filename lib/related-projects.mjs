// The other open projects Viridis stewards, and the one place VergeCommon points to
// Viridis's own services. One place to change the addresses.
//
// Invariants
//   R1  VergeCommon stays free and sells nothing: no price and no purchase language here.
//   R2  Exactly one link leads to Viridis services, and its label says whose service it is.
//   R3  Links are plain https addresses: no tracking parameters, nothing about the visitor.
//   R4  Project names are proper nouns and are not translated.
import { DFM_SITE_URL } from './dfm-site.mjs';

export const RELATED_PROJECTS = [
  { name: 'Dendritic Forest Management', href: DFM_SITE_URL },
  {
    name: 'Global Soil Intelligence Project',
    href: 'https://globalsoilintelligence.com/',
  },
  {
    name: 'Viridis Conservation',
    href: 'https://viridisconservation.com/ecosystem',
  },
];

export const VIRIDIS_SERVICES_HREF =
  'https://viridisconservation.com/corridor-mapping';
