/**
 * Species reference content for the identification guide.
 *
 * SCOPE AND HONESTY NOTE
 * ----------------------
 * The five species below are exactly the five that appear in the Elanco dataset
 * (`species` / `latinName`), so the guide matches the data the map plots. The
 * descriptive content is written at the level the sources actually support:
 * genus-level ecology and morphology, which is well established, rather than
 * invented species-level specifics. Where a claim would need a clinical source
 * we do not have, the entry says so instead of guessing — see `vectorNote`.
 *
 * None of this is veterinary advice, and the UI says as much next to the guide.
 */

import type { SeverityLevel } from '../types.js';

export interface SpeciesInfo {
  /** Common name, matching the API's `species` field exactly. */
  name: string;
  /** Binomial name, matching the API's `latinName` field exactly. */
  latinName: string;
  genus: 'Ixodes' | 'Dermacentor';
  /** One-line summary for cards and the map popup. */
  summary: string;
  /** Adult body length, unfed. */
  size: string;
  /** What to look for, with the naked eye or a hand lens. */
  appearance: string[];
  /** Animals the species typically feeds on. */
  hosts: string;
  /** Where it tends to be found. */
  habitat: string;
  /** How likely a pet owner is to encounter it, in plain words. */
  encounterLikelihood: 'Rarely encountered' | 'Occasionally encountered' | 'Commonly encountered';
  /**
   * Weight 0–1 fed into the derived risk model. Higher means the genus is more
   * strongly associated with pathogen transmission to animals or people.
   */
  vectorWeight: number;
  /** Plain-English justification for the weight, including its limits. */
  vectorNote: string;
  /** Categorical colour slot (1-indexed) used consistently across all charts. */
  colorSlot: 1 | 2 | 3 | 4 | 5;
}

/**
 * Ixodes is the genus that contains Ixodes ricinus, the principal UK vector of
 * Borrelia burgdorferi s.l. (Lyme borreliosis), which is why Ixodes entries
 * carry a higher weight than Dermacentor here. The weights are a transparent
 * modelling choice for this MVP, not a published risk index.
 */
export const SPECIES: readonly SpeciesInfo[] = [
  {
    name: 'Fox/badger tick',
    latinName: 'Ixodes canisuga',
    genus: 'Ixodes',
    summary:
      'A burrow-dwelling Ixodes tick of foxes, badgers and denning mammals that will also attach to dogs.',
    size: '3–4 mm unfed; up to roughly 11 mm when fully engorged.',
    appearance: [
      'Rounded, teardrop body with no pale markings or ornamentation on the shield.',
      'Uniform reddish-brown to grey, darkening and turning slate-grey as it engorges.',
      'Long, forward-projecting mouthparts typical of Ixodes — visible head-on with a hand lens.',
      'Eight legs as an adult or nymph; larvae have six.',
    ],
    hosts: 'Foxes, badgers and other denning carnivores; dogs that enter or dig around setts and earths.',
    habitat:
      'Nests, dens, setts and kennels rather than open vegetation — it is a nidicolous species, meaning it lives where its host sleeps.',
    encounterLikelihood: 'Occasionally encountered',
    vectorWeight: 0.7,
    vectorNote:
      'Weighted as an Ixodes species, the genus responsible for Lyme borreliosis transmission in the UK. Species-specific transmission data for I. canisuga is limited, so treat this as a precautionary genus-level weighting rather than a measured rate.',
    colorSlot: 1,
  },
  {
    name: 'Marsh tick',
    latinName: 'Ixodes apronophorus',
    genus: 'Ixodes',
    summary:
      'A wetland Ixodes tick associated with water voles and other riparian small mammals.',
    size: '2.5–4 mm unfed; noticeably larger when engorged.',
    appearance: [
      'Small, oval, smooth-shelled body with no pale pattern.',
      'Pale to mid reddish-brown; takes on a grey-blue cast when full of blood.',
      'Anal groove arching in front of the anus — the defining Ixodes feature, visible only under magnification.',
      'Legs set well forward on the body.',
    ],
    hosts: 'Water voles, shrews and other small mammals of wet ground; occasionally dogs worked near water.',
    habitat:
      'Marsh, fen, reedbed and the margins of slow watercourses — damp, densely vegetated ground that stays humid through summer.',
    encounterLikelihood: 'Rarely encountered',
    vectorWeight: 0.6,
    vectorNote:
      'Carries the Ixodes genus-level weighting. Its strong preference for small mammal hosts in wetland habitat means contact with pets and people is uncommon, which lowers practical exposure even where the tick is present.',
    colorSlot: 2,
  },
  {
    name: 'Southern rodent tick',
    latinName: 'Ixodes acuminatus',
    genus: 'Ixodes',
    summary:
      'A rodent-feeding Ixodes tick with a largely southern and continental European distribution.',
    size: '2–3.5 mm unfed.',
    appearance: [
      'Compact, narrow-fronted body — the name refers to its tapered profile.',
      'Reddish-brown, unmarked shield.',
      'Short, stout palps compared with other Ixodes species.',
      'Easily mistaken for an engorged nymph of a commoner species.',
    ],
    hosts: 'Mice, voles and other small rodents; recorded occasionally from dogs, livestock and people.',
    habitat:
      'Dry grassland, scrub edges and rodent burrows, typically in warmer and more sheltered ground than Ixodes ricinus favours.',
    encounterLikelihood: 'Rarely encountered',
    vectorWeight: 0.6,
    vectorNote:
      'Ixodes genus-level weighting applied. Rodent-specialist ticks maintain pathogens in wildlife reservoirs, but bites on pets and people are infrequent.',
    colorSlot: 3,
  },
  {
    name: 'Tree-hole tick',
    latinName: 'Ixodes arboricola',
    genus: 'Ixodes',
    summary:
      'A cavity-nesting Ixodes tick that completes its whole life cycle inside tree holes and nest boxes.',
    size: '2–3 mm unfed; among the smaller UK ticks.',
    appearance: [
      'Small, glossy, strongly convex body.',
      'Pale amber to reddish-brown with no ornamentation.',
      'Reduced eyes and short legs — adaptations to life in a dark cavity.',
      'Often found in numbers in nest material rather than singly on a host.',
    ],
    hosts: 'Hole-nesting birds — tits, starlings, nuthatches — and occasionally the small mammals that reuse the cavity.',
    habitat:
      'Inside tree holes, nest boxes and the nest lining itself. It does not quest on open vegetation, so it is not picked up on a walk.',
    encounterLikelihood: 'Rarely encountered',
    vectorWeight: 0.45,
    vectorNote:
      'Weighted below the ground-dwelling Ixodes species: a bird-cavity specialist rarely contacts pets or people. Any genus-level pathogen association is offset by minimal opportunity for a bite.',
    colorSlot: 4,
  },
  {
    name: 'Passerine tick',
    latinName: 'Dermacentor frontalis',
    genus: 'Dermacentor',
    summary:
      'A bird-associated Dermacentor tick; the genus is recognisable by its patterned, enamelled shield.',
    size: '3–5 mm unfed; Dermacentor adults are among the larger hard ticks.',
    appearance: [
      'Ornate shield — pale grey or cream enamel marbling over a dark base, unlike the plain brown Ixodes species.',
      'Broad, rectangular mouthparts (short and blunt, not long and tapering).',
      'Visible eyes at the edge of the shield, and festoons — small notches along the rear margin.',
      'Patterning is the single most useful field character separating Dermacentor from Ixodes.',
    ],
    hosts: 'Ground-feeding passerine birds; Dermacentor species more broadly feed on mammals including dogs, livestock and horses.',
    habitat:
      'Grassland, heath and woodland edge where host birds forage. Dermacentor species tolerate drier, more open ground than Ixodes.',
    encounterLikelihood: 'Occasionally encountered',
    vectorWeight: 0.5,
    vectorNote:
      'Dermacentor species are vectors of several tick-borne pathogens of animals, but they are not the principal Lyme borreliosis vector in the UK, so the genus sits below Ixodes in this model. We could not source species-level transmission data for D. frontalis.',
    colorSlot: 5,
  },
];

const SPECIES_BY_NAME = new Map<string, SpeciesInfo>(
  SPECIES.map((species) => [species.name.toLowerCase(), species]),
);

export function findSpecies(name: string): SpeciesInfo | undefined {
  return SPECIES_BY_NAME.get(name.trim().toLowerCase());
}

/** Alphabetical common names, for filter and form dropdowns. */
export const SPECIES_NAMES: readonly string[] = SPECIES.map((s) => s.name)
  .slice()
  .sort((a, b) => a.localeCompare(b, 'en-GB'));

/** Default weight for a species the API introduces that we have no entry for. */
export const DEFAULT_VECTOR_WEIGHT = 0.5;

/** Human-readable label for each severity level, used throughout the UI. */
export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
};

/** What each severity level means, in plain English. */
export const SEVERITY_DESCRIPTIONS: Record<SeverityLevel, string> = {
  low: 'Background activity. Standard year-round tick checks are appropriate.',
  moderate: 'Raised activity. Check pets after every walk in long grass or woodland.',
  high: 'Elevated activity for this area and time of year. Use a preventative treatment and check thoroughly.',
  severe: 'Among the highest-scoring sightings in the dataset. Treat the area as high exposure.',
};
