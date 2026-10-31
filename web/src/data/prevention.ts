/**
 * Prevention and tick-removal guidance.
 *
 * SOURCING NOTE
 * -------------
 * This content reflects standard, widely published UK public-health and
 * veterinary advice (UKHSA tick awareness guidance and the general consensus of
 * veterinary parasitology on removal technique). It is written as general
 * education, and the UI pairs it with a visible statement that it is not
 * veterinary or medical advice and that a vet or GP should be consulted for an
 * actual case. No claim here goes beyond what that mainstream guidance supports.
 *
 * The removal steps are given deliberate prominence because they are the part
 * most often got wrong, and the common wrong methods actively raise risk.
 */

export interface PreventionTopic {
  id: string;
  title: string;
  /** One-line summary for the card header. */
  summary: string;
  tips: string[];
}

export const PREVENTION_TOPICS: readonly PreventionTopic[] = [
  {
    id: 'before-you-go',
    title: 'Before a walk',
    summary: 'Most bites are avoidable with a few habits before you set off.',
    tips: [
      'Keep a preventative treatment up to date for dogs and cats. Your vet will match the product to the animal, its weight and the local season — never use a dog product on a cat, as some are toxic to them.',
      'Stick to paths where you can. Ticks quest from the tips of vegetation, so the edges of long grass and bracken are where contact happens.',
      'Wear light-coloured trousers tucked into socks. It is not a fashion statement: a tick crossing pale fabric is visible, and on dark fabric it is not.',
      'Use an insect repellent rated for ticks on exposed skin, following the label for reapplication.',
      'Take a tick removal tool or fine-tipped tweezers with you. The sooner a tick comes off, the lower the risk it transmits anything.',
    ],
  },
  {
    id: 'after-a-walk',
    title: 'After a walk',
    summary: 'A systematic check beats a quick glance — ticks hide in warm, thin-skinned places.',
    tips: [
      'Check your pet within a few hours. Work by feel as well as sight: an unfed tick is the size of a sesame seed and easy to miss in a coat.',
      'Concentrate on the head, ears and ear margins, neck, armpits, groin, between the toes and under the collar.',
      'Check yourself and children too, particularly the hairline, behind the ears, the backs of the knees, the waistband and the groin.',
      'Brush down and check outdoor clothing. A tick can travel home on a trouser leg and attach hours later.',
      'A shower within a couple of hours helps wash off any tick that has not yet attached.',
    ],
  },
  {
    id: 'removal',
    title: 'Removing a tick safely',
    summary: 'Technique matters. Several popular methods make things worse.',
    tips: [
      'Use a tick removal tool or fine-tipped tweezers. Grip the tick as close to the skin as you can, taking the tick itself rather than its swollen body.',
      'Pull steadily upwards, or twist gently if you are using a hooked tool. Do not jerk or twist a straight pull — that is what leaves mouthparts behind.',
      'Clean the bite site with antiseptic afterwards and wash your hands.',
      'Do NOT burn the tick, smother it in petroleum jelly, alcohol, nail varnish or oil, or crush its body while it is attached. All of these can make it regurgitate into the wound, which is precisely the moment pathogens are transmitted.',
      'Note the date and where you were. If symptoms appear later, that detail genuinely changes the clinical picture.',
    ],
  },
  {
    id: 'after-a-bite',
    title: 'What to watch for afterwards',
    summary: 'Most bites are harmless, but a few signs warrant a professional opinion.',
    tips: [
      'In people: an expanding circular or oval rash around the bite, often clearing in the centre, appearing between three days and three months later. Contact a GP if you see it.',
      'Also in people: a flu-like illness with fever, headache, aching joints or marked fatigue in the weeks after a bite. Mention the bite explicitly — it changes what a clinician tests for.',
      'In pets: lameness that moves between legs, lethargy, reluctance to exercise, fever, swollen joints or loss of appetite. Speak to your vet.',
      'Keep the removed tick in a sealed bag or pot if you can. Identifying the species helps your vet or GP judge what is and is not plausible.',
      'Do not wait for a rash before seeking advice if you feel unwell. The rash does not appear in every case.',
    ],
  },
  {
    id: 'garden',
    title: 'Reducing ticks around the home',
    summary: 'Habitat management lowers the number of ticks your pets meet at home.',
    tips: [
      'Keep lawns cut and clear leaf litter and long grass from the edges of the garden, where humidity keeps ticks alive.',
      'Create a gravel or bark strip between a lawn and adjoining woodland or rough ground. Ticks do not readily cross dry, open substrate.',
      'Discourage deer and rodents where you reasonably can — they are the hosts that carry ticks into a garden in the first place.',
      'Keep kennels, bedding and runs clean and dry. Several of the species in this dataset live in nests and dens rather than on open vegetation.',
      'Check stored firewood and nest boxes, which are classic cavity habitat for species such as the tree-hole tick.',
    ],
  },
];

/** Shown wherever health guidance appears. */
export const MEDICAL_DISCLAIMER =
  'This guidance is general public-health information, not veterinary or medical advice. If you are worried about a bite on a person or an animal, contact a GP or vet — they can assess the individual case in a way a website cannot.';
