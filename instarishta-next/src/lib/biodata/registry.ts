import type { FieldDef, Option, Registry, SectionDef } from './types';

/**
 * THE FIELD REGISTRY -- the cross-check.
 *
 * This is the union of the fields asked for by the mainstream matrimonial
 * platforms and by the online biodata makers, so that no biodata a family
 * already owns has a detail this app cannot hold:
 *
 *   platforms      Shaadi.com, BharatMatrimony, Jeevansathi, Matrimony.com
 *                  regional sites, Nikah.com, Muslima/MuslimMarriage,
 *                  SimplyMarry, Betterhalf, Bandhan
 *   biodata makers mymarriagebiodata.in, weddingbiodatabuilder.in,
 *                  indianbiodatamaker.com, simplebiodatamaker.in,
 *                  marriagebiodataonline.com, biodataformarriage.net,
 *                  myperfectbiodata.com, shadibiodata.com, biodata99.com,
 *                  rishtamaker.in, onlinebiodatamaker.com, englishbiodata.com
 *
 * `sources` on each field records where the field was seen. It is
 * documentation of the cross-check, not runtime behaviour.
 *
 * NOTHING HERE IS REQUIRED. There is deliberately no `required` flag in
 * FieldDef -- it cannot be set even by mistake.
 */

const P = ['platform'];
const B = ['biodata-maker'];
const PB = ['platform', 'biodata-maker'];

/* ------------------------------------------------------------------ *
 * Shared option sets
 * ------------------------------------------------------------------ */

const opts = (...v: string[]): Option[] =>
  v.map((label) => ({ value: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label }));

const YES_NO: Option[] = opts('Yes', 'No');
const YES_NO_SOMETIMES: Option[] = opts('Yes', 'No', 'Sometimes');

export const RELIGIONS = opts(
  'Islam', 'Hindu', 'Christian', 'Sikh', 'Jain', 'Buddhist', 'Parsi', 'Jewish',
  'Spiritual', 'No religion', 'Other',
);

export const MARITAL_STATUS: Option[] = [
  { value: 'never-married', label: 'Never married', short: 'Single' },
  { value: 'divorced', label: 'Divorced' },
  { value: 'widowed', label: 'Widowed' },
  { value: 'separated', label: 'Separated' },
  { value: 'annulled', label: 'Annulled (khula / faskh)', short: 'Annulled' },
  { value: 'awaiting-divorce', label: 'Awaiting divorce' },
];

export const MOTHER_TONGUES = opts(
  'Urdu', 'Hindi', 'Dakhini', 'English', 'Bengali', 'Marathi', 'Telugu', 'Tamil',
  'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Assamese', 'Kashmiri',
  'Sindhi', 'Konkani', 'Bhojpuri', 'Rajasthani', 'Maithili', 'Memoni', 'Arabic',
  'Persian', 'Pashto', 'Nepali', 'Other',
);

export const COMPLEXIONS = opts('Very fair', 'Fair', 'Wheatish', 'Wheatish brown', 'Dark', 'Prefer not to say');
export const BODY_TYPES = opts('Slim', 'Athletic', 'Average', 'Heavy', 'Muscular');
export const BLOOD_GROUPS = opts('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-', 'Bombay blood group', 'Do not know');

// `short` is what the icon grid over a photograph shows, where a long label
// would be clipped mid-word.
export const DIETS: Option[] = [
  { value: 'halal-only', label: 'Halal only' },
  { value: 'vegetarian', label: 'Vegetarian', short: 'Veg' },
  { value: 'non-vegetarian', label: 'Non-vegetarian', short: 'Non-veg' },
  { value: 'eggetarian', label: 'Eggetarian', short: 'Egg' },
  { value: 'jain-vegetarian', label: 'Jain vegetarian', short: 'Jain veg' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'occasionally-non-veg', label: 'Occasionally non-veg', short: 'Occ. non-veg' },
];

export const FREQ = opts('Never', 'Occasionally', 'Regularly', 'Trying to quit');

export const EMPLOYED_IN = opts(
  'Private sector', 'Government / PSU', 'Business / Self-employed', 'Defence',
  'Civil services', 'Not working', 'Student', 'Retired', 'Homemaker',
);

export const FAMILY_TYPE = opts('Joint family', 'Nuclear family', 'Extended family', 'Living alone');
export const FAMILY_STATUS = opts('Modest', 'Middle class', 'Upper middle class', 'Affluent', 'High net worth');
export const FAMILY_VALUES = opts('Traditional', 'Moderate', 'Liberal', 'Orthodox');

export const RESIDENCY = opts(
  'Citizen', 'Permanent resident', 'Work permit / visa', 'Student visa',
  'Dependent visa', 'Temporary visa', 'Seeking to relocate',
);

export const PHYSICAL_STATUS: Option[] = [
  { value: 'normal', label: 'No disability' },
  { value: 'physically-challenged', label: 'Physically challenged' },
  { value: 'chronic-condition', label: 'Manages a chronic condition' },
];

export const MASLAK = opts(
  'Sunni', 'Shia', 'Deobandi', 'Barelvi', 'Ahle Hadith / Salafi', 'Ahle Quran',
  'Bohra', 'Ismaili', 'Sufi', 'Just Muslim', 'Other',
);
export const MADHAB = opts('Hanafi', 'Shafi', 'Maliki', 'Hanbali', 'Jafari', 'Not particular');
export const NAMAZ = [
  { value: 'five-times-daily', label: 'Five times daily', short: '5x' },
  { value: 'regularly', label: 'Regularly' },
  { value: 'jummah-only', label: 'Jummah only' },
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'recently-started', label: 'Recently started', short: 'New' },
  { value: 'not-yet', label: 'Not yet' },
];
export const HIJAB = opts('Niqab', 'Hijab', 'Abaya', 'Modest dress', 'Sometimes', 'No', 'Plan to after nikah');
export const BEARD = opts('Sunnah beard', 'Yes', 'Trimmed', 'No', 'Plan to keep');
export const DEENI_EDUCATION = opts(
  'Hafiz-e-Quran', 'Alim / Alima', 'Qari / Qaria', 'Mufti', 'Madrasa educated',
  'Quran with tajweed', 'Nazra Quran', 'Islamic online courses', 'None yet',
);

export const RASHI = opts(
  'Mesha (Aries)', 'Vrishabha (Taurus)', 'Mithuna (Gemini)', 'Karka (Cancer)',
  'Simha (Leo)', 'Kanya (Virgo)', 'Tula (Libra)', 'Vrischika (Scorpio)',
  'Dhanu (Sagittarius)', 'Makara (Capricorn)', 'Kumbha (Aquarius)', 'Meena (Pisces)',
);
export const NAKSHATRA = opts(
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu',
  'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta',
  'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha',
  'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
);
export const MANGLIK = opts('Manglik', 'Non-manglik', 'Anshik (partial) manglik', 'Do not know', 'Does not matter');

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

export const SECTIONS: SectionDef[] = [
  { id: 'basics', title: 'Basic details', order: 10, layout: 'list', icon: 'user' },
  { id: 'appearance', title: 'Appearance', order: 20, layout: 'list', icon: 'height' },
  { id: 'health', title: 'Health & lifestyle', order: 30, layout: 'list', icon: 'heart' },
  { id: 'deen', title: 'Deen & practice', subtitle: 'What families ask first', order: 40, layout: 'list', icon: 'namaz', appliesTo: { religion: ['islam'] } },
  { id: 'faith', title: 'Faith & community', order: 45, layout: 'list', icon: 'faith' },
  { id: 'astro', title: 'Horoscope', order: 50, layout: 'list', icon: 'star', appliesTo: { religion: ['hindu', 'jain', 'sikh', 'buddhist'] } },
  { id: 'birth', title: 'Birth details', order: 55, layout: 'list', icon: 'age' },
  { id: 'education', title: 'Education', order: 60, layout: 'timeline', icon: 'education' },
  { id: 'career', title: 'Career', order: 70, layout: 'list', icon: 'work' },
  { id: 'assets', title: 'Assets & finances', order: 80, layout: 'list', icon: 'home' },
  { id: 'family', title: 'Family Details', order: 90, layout: 'grid', icon: 'family' },
  { id: 'residence', title: 'Residence', order: 100, layout: 'list', icon: 'address' },
  { id: 'lifestyle', title: 'Interests', order: 110, layout: 'tags', icon: 'interests' },
  { id: 'about', title: 'In their words', order: 120, layout: 'prose', icon: 'quote' },
  { id: 'marriage', title: 'Nikah & logistics', order: 130, layout: 'list', icon: 'rings' },
  { id: 'preferences', title: 'Looking for', subtitle: 'What they hope to find', order: 140, layout: 'list', icon: 'search' },
  // The live frame gives photographs the whole intro beat and never puts
  // contact details on air, so neither section is offered to that surface.
  { id: 'contact', title: 'Contact', order: 150, layout: 'list', icon: 'phone', visibility: 'connected', surfaces: ['page', 'print'] },
  { id: 'media', title: 'Photos & media', order: 160, layout: 'grid', icon: 'photo', surfaces: ['page'] },
];

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

let seq = 0;
const f = (d: Omit<FieldDef, 'order'> & { order?: number }): FieldDef => ({
  ...d,
  order: d.order ?? (seq += 10),
});

const MUSLIM_ONLY = { religion: ['islam'] };

/**
 * The broadcast does not repeat what the intro photograph already carries.
 * These fields are the icon grid and the name lockup on that beat, so they
 * are offered to every surface except `broadcast`.
 */
export const FIELDS: FieldDef[] = [
  /* ---------------- basics ---------------- */
  f({ key: 'fullName', label: 'Full name', type: 'text', section: 'basics', icon: 'user', sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'nickName', label: 'Called at home', type: 'text', section: 'basics', sources: B, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'profileFor', label: 'Profile created for', type: 'select', section: 'basics', sources: P,
      options: opts('Myself', 'Son', 'Daughter', 'Brother', 'Sister', 'Relative', 'Friend', 'Ward'), surfaces: ['page', 'card', 'print'] }),
  f({ key: 'gender', label: 'Bride / Groom', type: 'select', section: 'basics', icon: 'user', sources: PB,
      options: [{ value: 'bride', label: 'Bride' }, { value: 'groom', label: 'Groom' }], surfaces: ['page', 'card', 'print'] }),
  f({ key: 'dateOfBirth', label: 'Year of birth', type: 'date', format: 'year', section: 'birth', icon: 'age', sources: PB }),
  f({ key: 'age', label: 'Age', type: 'number', section: 'basics', icon: 'age', unit: 'years', quickFact: true,
      help: 'Left blank, it is computed from the date of birth.', sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'maritalStatus', label: 'Marital status', type: 'select', section: 'basics', icon: 'status',
      options: MARITAL_STATUS, quickFact: true, sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'hasChildren', label: 'Has children', type: 'select', section: 'basics', options: YES_NO, sources: P,
      appliesTo: { maritalStatus: ['divorced', 'widowed', 'separated', 'annulled'] } }),
  f({ key: 'childrenCount', label: 'Number of children', type: 'number', section: 'basics', sources: P,
      appliesTo: { when: { key: 'hasChildren', equals: ['yes'] } } }),
  f({ key: 'childrenLivingWith', label: 'Children living with', type: 'select', section: 'basics', sources: P,
      options: opts('Me', 'Other parent', 'Grandparents', 'Not applicable'),
      appliesTo: { when: { key: 'hasChildren', equals: ['yes'] } } }),
  f({ key: 'motherTongue', label: 'Mother tongue', type: 'select', section: 'basics', options: MOTHER_TONGUES, allowCustom: true, sources: PB }),
  f({ key: 'languagesKnown', label: 'Languages known', type: 'multiselect', section: 'basics', options: MOTHER_TONGUES, allowCustom: true, sources: PB }),
  f({ key: 'nationality', label: 'Nationality', type: 'text', section: 'basics', sources: P }),

  /* ---------------- appearance ---------------- */
  f({ key: 'heightCm', label: 'Height', type: 'height', section: 'appearance', icon: 'height', quickFact: true, sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'weightKg', label: 'Weight', type: 'weight', section: 'appearance', unit: 'kg', sources: PB }),
  f({ key: 'bodyType', label: 'Build', type: 'select', section: 'appearance', icon: 'build', options: BODY_TYPES, sources: PB , quickFact: true, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'complexion', label: 'Complexion', type: 'select', section: 'appearance', icon: 'complexion', options: COMPLEXIONS, quickFact: true, sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'hairColour', label: 'Hair colour', type: 'text', section: 'appearance', sources: B }),
  f({ key: 'eyeColour', label: 'Eye colour', type: 'text', section: 'appearance', sources: B }),
  f({ key: 'wearsGlasses', label: 'Wears glasses / lenses', type: 'select', section: 'appearance', options: YES_NO, sources: B }),
  f({ key: 'distinctiveMarks', label: 'Distinctive marks', type: 'text', section: 'appearance', sources: B }),

  /* ---------------- health & lifestyle ---------------- */
  f({ key: 'bloodGroup', label: 'Blood group', type: 'select', section: 'health', icon: 'blood', options: BLOOD_GROUPS, sources: PB }),
  f({ key: 'physicalStatus', label: 'Physical status', type: 'select', section: 'health', options: PHYSICAL_STATUS, sources: P }),
  f({ key: 'disabilityDetails', label: 'Details', type: 'text', section: 'health', sources: P,
      appliesTo: { when: { key: 'physicalStatus', equals: ['physically-challenged', 'chronic-condition'] } } }),
  f({ key: 'healthNotes', label: 'Health notes', type: 'longtext', section: 'health', sources: P }),
  f({ key: 'thalassemiaStatus', label: 'Thalassemia / genetic screening', type: 'select', section: 'health', sources: B,
      options: opts('Screened - clear', 'Minor / carrier', 'Not screened', 'Prefer not to say') }),
  f({ key: 'diet', label: 'Diet', type: 'select', section: 'health', icon: 'diet', options: DIETS, quickFact: true, sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'smoking', label: 'Smoking', type: 'select', section: 'health', icon: 'smoking', options: FREQ, sources: PB }),
  f({ key: 'drinking', label: 'Drinking', type: 'select', section: 'health', icon: 'drinking', options: FREQ, sources: PB }),
  f({ key: 'fitnessRoutine', label: 'Fitness routine', type: 'text', section: 'health', sources: B }),

  /* ---------------- deen (Muslim) ---------------- */
  f({ key: 'maslak', label: 'Maslak / sect', type: 'select', section: 'deen', icon: 'maslak', options: MASLAK,
      allowCustom: true, appliesTo: MUSLIM_ONLY, sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'madhab', label: 'Fiqh / madhab', type: 'select', section: 'deen', options: MADHAB, appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'namaz', label: 'Namaz', type: 'select', section: 'deen', icon: 'namaz', options: NAMAZ, quickFact: true, appliesTo: MUSLIM_ONLY, sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'namazAtMasjid', label: 'Prays at the masjid', type: 'select', section: 'deen', options: YES_NO_SOMETIMES,
      appliesTo: { religion: ['islam'], gender: ['groom'] }, sources: B }),
  f({ key: 'fasting', label: 'Ramadan fasting', type: 'select', section: 'deen', options: opts('All 30 days', 'Most days', 'Some days', 'Unable - health'), appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'quranRecitation', label: 'Quran recitation', type: 'select', section: 'deen',
      options: opts('Daily', 'Weekly', 'Occasionally', 'Learning'), appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'deeniEducation', label: 'Deeni education', type: 'multiselect', section: 'deen', icon: 'quran',
      options: DEENI_EDUCATION, allowCustom: true, appliesTo: MUSLIM_ONLY, sources: PB }),
  f({ key: 'hijab', label: 'Hijab / purdah', type: 'select', section: 'deen', icon: 'hijab', options: HIJAB,
      appliesTo: { religion: ['islam'], gender: ['bride'] }, sources: PB }),
  f({ key: 'beard', label: 'Beard', type: 'select', section: 'deen', icon: 'beard', options: BEARD,
      appliesTo: { religion: ['islam'], gender: ['groom'] }, sources: PB }),
  f({ key: 'hajjUmrah', label: 'Hajj / Umrah performed', type: 'multiselect', section: 'deen',
      options: opts('Hajj', 'Umrah', 'Neither yet'), appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'dargaFatiha', label: 'Darga / fatiha', type: 'select', section: 'deen', icon: 'darga',
      options: opts('Observes', 'Does not observe', 'Not particular'), appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'islamicOrg', label: 'Jamaat / islamic work', type: 'text', section: 'deen', appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'interestFreeFinance', label: 'Keeps finances interest-free', type: 'select', section: 'deen', options: YES_NO_SOMETIMES, appliesTo: MUSLIM_ONLY, sources: B }),

  /* ---------------- faith & community (all religions) ---------------- */
  f({ key: 'religion', label: 'Religion', type: 'select', section: 'faith', icon: 'faith', options: RELIGIONS, allowCustom: true, sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'community', label: 'Community', type: 'text', section: 'faith', icon: 'community', quickFact: true,
      help: 'Syed, Sheikh, Pathan, Mughal, Ansari, Qureshi, Memon...', sources: PB, surfaces: ['page', 'card', 'print'] }),
  f({ key: 'subCommunity', label: 'Sub-community', type: 'text', section: 'faith', sources: P }),
  f({ key: 'gotra', label: 'Gotra', type: 'text', section: 'faith', appliesTo: { religion: ['hindu', 'jain', 'sikh'] }, sources: PB }),
  f({ key: 'denomination', label: 'Denomination / parish', type: 'text', section: 'faith', appliesTo: { religion: ['christian'] }, sources: B }),
  f({ key: 'casteNoBar', label: 'Open to other communities', type: 'select', section: 'faith', options: YES_NO, sources: P }),

  /* ---------------- horoscope ---------------- */
  f({ key: 'rashi', label: 'Rashi (moon sign)', type: 'select', section: 'astro', options: RASHI, sources: PB }),
  f({ key: 'nakshatra', label: 'Nakshatra / star', type: 'select', section: 'astro', options: NAKSHATRA, sources: PB }),
  f({ key: 'padam', label: 'Padam / charan', type: 'select', section: 'astro', options: opts('1', '2', '3', '4'), sources: P }),
  f({ key: 'manglik', label: 'Manglik / dosham', type: 'select', section: 'astro', options: MANGLIK, sources: PB }),
  f({ key: 'lagna', label: 'Lagna / ascendant', type: 'text', section: 'astro', sources: B }),
  f({ key: 'gan', label: 'Gan', type: 'text', section: 'astro', sources: B }),
  f({ key: 'nadi', label: 'Nadi', type: 'text', section: 'astro', sources: B }),
  f({ key: 'horoscopeMatchRequired', label: 'Horoscope match expected', type: 'select', section: 'astro', options: YES_NO, sources: P }),
  f({ key: 'horoscopeFile', label: 'Kundali', type: 'file', section: 'astro', sources: P }),

  /* ---------------- birth ---------------- */
  f({ key: 'birthTime', label: 'Time of birth', type: 'time', section: 'birth', icon: 'birthtime', sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'birthPlace', label: 'Place of birth', type: 'text', section: 'birth', icon: 'birthplace', sources: PB }),
  f({ key: 'birthCountry', label: 'Country of birth', type: 'text', section: 'birth', sources: B }),

  /* ---------------- education ---------------- */
  f({ key: 'highestQualification', label: 'Highest qualification', type: 'text', section: 'education', icon: 'education', sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'educationDetails', label: 'Degrees', type: 'repeater', section: 'education', addLabel: 'Add a degree', sources: PB,
      fields: [
        { key: 'degree', label: 'Degree', type: 'text', primary: true },
        { key: 'specialization', label: 'Specialization', type: 'text' },
        { key: 'institution', label: 'College / university', type: 'text' },
        { key: 'location', label: 'Location', type: 'text' },
        { key: 'year', label: 'Year', type: 'text', role: true },
        { key: 'grade', label: 'Grade / %', type: 'text' },
      ] }),
  f({ key: 'schooling', label: 'School', type: 'text', section: 'education', sources: B }),
  f({ key: 'educationMedium', label: 'Medium of study', type: 'select', section: 'education',
      options: opts('English', 'Urdu', 'Hindi', 'Regional', 'Arabic'), sources: B }),
  f({ key: 'certifications', label: 'Certifications', type: 'tags', section: 'education', sources: B }),

  /* ---------------- career ---------------- */
  f({ key: 'employedIn', label: 'Employed in', type: 'select', section: 'career', icon: 'work', options: EMPLOYED_IN, sources: PB }),
  f({ key: 'occupation', label: 'Occupation', type: 'text', section: 'career', icon: 'work', sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'designation', label: 'Designation', type: 'text', section: 'career', sources: PB }),
  f({ key: 'organisation', label: 'Company / organisation', type: 'text', section: 'career', sources: PB }),
  f({ key: 'industry', label: 'Industry', type: 'text', section: 'career', sources: P }),
  f({ key: 'workLocation', label: 'Work location', type: 'text', section: 'career', sources: PB }),
  f({ key: 'experienceYears', label: 'Experience', type: 'number', section: 'career', unit: 'years', sources: P }),
  f({ key: 'annualIncome', label: 'Annual income', type: 'money', section: 'career', visibility: 'connected', sources: PB }),
  f({ key: 'businessNature', label: 'Nature of business', type: 'text', section: 'career', sources: B,
      appliesTo: { when: { key: 'employedIn', equals: ['business-self-employed'] } } }),
  f({ key: 'workHistory', label: 'Work history', type: 'repeater', section: 'career', addLabel: 'Add a role', sources: B,
      fields: [
        { key: 'role', label: 'Role', type: 'text', primary: true },
        { key: 'employer', label: 'Employer', type: 'text', role: true },
        { key: 'from', label: 'From', type: 'text' },
        { key: 'to', label: 'To', type: 'text' },
      ] }),

  /* ---------------- assets ---------------- */
  f({ key: 'ownsHouse', label: 'Owns a house', type: 'select', section: 'assets', options: YES_NO, sources: P }),
  f({ key: 'ownsCar', label: 'Owns a vehicle', type: 'select', section: 'assets', options: YES_NO, sources: P }),
  f({ key: 'properties', label: 'Property', type: 'longtext', section: 'assets', visibility: 'connected', sources: B }),
  f({ key: 'familyIncome', label: 'Family income', type: 'money', section: 'assets', visibility: 'connected', sources: PB }),

  /* ---------------- family ---------------- */
  f({ key: 'familyInfo', label: 'About the family', type: 'longtext', section: 'family', icon: 'sibling', sources: PB }),
  f({ key: 'fatherName', label: "Father's name", shortLabel: 'Father', tone: 'gold', type: 'text', section: 'family', icon: 'father', sources: PB , group: 'Parents' }),
  f({ key: 'fatherOccupation', label: "Father's occupation", type: 'text', section: 'family', pairWith: 'fatherName', sources: PB }),
  f({ key: 'fatherAlive', label: 'Father', type: 'select', section: 'family', options: opts('Alive', 'Late'), sources: B , group: 'Parents' }),
  f({ key: 'motherName', label: "Mother's name", shortLabel: 'Mother', tone: 'rose', type: 'text', section: 'family', icon: 'mother', sources: PB , group: 'Parents' }),
  f({ key: 'motherOccupation', label: "Mother's occupation", type: 'text', section: 'family', pairWith: 'motherName', sources: PB }),
  f({ key: 'motherAlive', label: 'Mother', type: 'select', section: 'family', options: opts('Alive', 'Late'), sources: B , group: 'Parents' }),
  f({ key: 'siblings', label: 'Siblings', type: 'repeater', section: 'family', addLabel: 'Add a sibling', icon: 'sibling', tone: 'lilac', sources: PB,
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true },
        { key: 'relation', label: 'Relation', type: 'select', role: true, options: opts('Brother', 'Sister') },
        { key: 'age', label: 'Age', type: 'number' },
        { key: 'maritalStatus', label: 'Marital status', type: 'select', options: MARITAL_STATUS },
        { key: 'occupation', label: 'Occupation', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
      ] , group: 'Siblings & others' }),
  f({ key: 'siblingSummary', label: 'Siblings (summary)', type: 'repeater', section: 'family', addLabel: 'Add a count', tone: 'lilac', sources: B,
      help: 'For families who give counts rather than names.',
      fields: [
        { key: 'relation', label: 'Relation', type: 'select', role: true, options: opts('Brother', 'Sister') },
        { key: 'count', label: 'How many', type: 'number', primary: true },
        { key: 'married', label: 'Of whom married', type: 'number', unit: 'married' },
      ] , group: 'Siblings & others' }),
  f({ key: 'grandparents', label: 'Grandparents', type: 'repeater', section: 'family', addLabel: 'Add a grandparent',
      tone: 'lilac', sources: B,
      help: 'Asked of joint families, where the elders are part of the match.',
      fields: [
        { key: 'relation', label: 'Relation', type: 'select', role: true,
          options: opts('Paternal grandfather', 'Paternal grandmother', 'Maternal grandfather', 'Maternal grandmother') },
        { key: 'name', label: 'Name', type: 'text', primary: true },
        { key: 'occupation', label: 'Occupation', type: 'text' },
        { key: 'alive', label: 'Status', type: 'select', options: opts('Alive', 'Late') },
      ] , group: 'Siblings & others' }),
  f({ key: 'relatives', label: 'Key relatives', tone: 'lilac', type: 'repeater', section: 'family', addLabel: 'Add a relative', sources: B,
      help: 'Guardians, uncles, elders who matter to the match.',
      fields: [
        { key: 'name', label: 'Name', type: 'text', primary: true },
        { key: 'relation', label: 'Relation', type: 'text', role: true },
        { key: 'occupation', label: 'Occupation', type: 'text' },
        { key: 'city', label: 'City', type: 'text' },
      ] , group: 'Siblings & others' }),

  /* ---------------- household ---------------- */
  f({ key: 'familyType', label: 'Family type', type: 'select', section: 'family', options: FAMILY_TYPE, sources: PB }),
  f({ key: 'familyStatus', label: 'Family status', type: 'select', section: 'family', options: FAMILY_STATUS, sources: P }),
  f({ key: 'familyValues', label: 'Family values', type: 'select', section: 'family', options: FAMILY_VALUES, sources: PB }),
  f({ key: 'nativePlace', label: 'Native place', type: 'text', section: 'family', sources: PB }),
  f({ key: 'ancestralOrigin', label: 'Ancestral origin / khandan', type: 'text', section: 'family', sources: B }),
  f({ key: 'familyBasedOut', label: 'Family based out of', type: 'text', section: 'family', sources: P }),

  /* ---------------- residence ---------------- */
  f({ key: 'area', label: 'Area / locality', type: 'text', section: 'residence', icon: 'address', sources: B }),
  f({ key: 'city', label: 'City', type: 'text', section: 'residence', icon: 'birthplace', quickFact: true, sources: PB , surfaces: ['page', 'card', 'print'] }),
  f({ key: 'state', label: 'State', type: 'text', section: 'residence', sources: PB }),
  f({ key: 'country', label: 'Country', type: 'text', section: 'residence', sources: PB }),
  f({ key: 'pincode', label: 'PIN / ZIP', type: 'text', section: 'residence', visibility: 'connected', sources: B }),
  f({ key: 'fullAddress', label: 'Address', type: 'longtext', section: 'residence', visibility: 'connected', sources: B }),
  f({ key: 'residencyStatus', label: 'Residency status', type: 'select', section: 'residence', options: RESIDENCY, sources: P }),
  f({ key: 'citizenship', label: 'Citizenship', type: 'text', section: 'residence', sources: P }),
  f({ key: 'willingToRelocate', label: 'Willing to relocate', type: 'select', section: 'residence', options: YES_NO_SOMETIMES, sources: P }),

  /* ---------------- interests ---------------- */
  f({ key: 'hobbies', label: 'Hobbies', type: 'tags', section: 'lifestyle', icon: 'interests', sources: PB }),
  f({ key: 'interests', label: 'Interests', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'sports', label: 'Sports & fitness', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'music', label: 'Music', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'books', label: 'Books', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'cuisine', label: 'Favourite food', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'travel', label: 'Places travelled', type: 'tags', section: 'lifestyle', sources: P }),
  f({ key: 'dressStyle', label: 'Dress style', type: 'text', section: 'lifestyle', sources: P }),
  f({ key: 'personalityTraits', label: 'Personality', type: 'tags', section: 'lifestyle', sources: B }),
  f({ key: 'pets', label: 'Pets', type: 'text', section: 'lifestyle', sources: P }),

  /* ---------------- about ---------------- */
  // Spoken over the intro photograph on air, so it does not also take a
  // biodata page there.
  f({ key: 'aboutMe', label: 'About', type: 'longtext', section: 'about', icon: 'quote',
      surfaces: ['page', 'card', 'print'], sources: PB }),
  f({ key: 'lifeGoals', label: 'Life goals', type: 'longtext', section: 'about', sources: B }),
  f({ key: 'whyMarriage', label: 'What marriage means to them', type: 'longtext', section: 'about', sources: B }),

  /* ---------------- nikah & logistics ---------------- */
  f({ key: 'marriageTimeline', label: 'Hoping to marry', type: 'select', section: 'marriage', sources: B,
      options: opts('As soon as possible', 'Within 6 months', 'Within a year', 'In 1-2 years', 'No fixed timeline') }),
  f({ key: 'mahrExpectation', label: 'Mahr / haq mehr', type: 'text', section: 'marriage', appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'waliName', label: 'Wali / guardian', type: 'text', section: 'marriage', appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'dowryStance', label: 'Dowry', type: 'select', section: 'marriage', sources: B,
      options: opts('No dowry - completely against', 'Simple nikah', 'As per custom', 'To discuss') }),
  f({ key: 'ceremonyStyle', label: 'Ceremony', type: 'select', section: 'marriage', sources: B,
      options: opts('Simple masjid nikah', 'Small family function', 'Traditional wedding', 'Flexible') }),
  f({ key: 'relationshipGoal', label: 'Hoping this leads to', type: 'select', section: 'marriage', sources: B,
      options: opts('Nikah soon', 'Nikah in time', 'Getting to know first', 'Family-arranged nikah') }),
  f({ key: 'residenceAfterMarriage', label: 'Residence after nikah', type: 'select', section: 'marriage', sources: P,
      options: opts('With my family', 'Separate home', 'Partner decides', 'Flexible', 'Abroad') }),
  f({ key: 'workAfterMarriage', label: 'Work after marriage', type: 'select', section: 'marriage', sources: P,
      options: opts('Will continue', 'Will stop', 'Partner decides', 'Undecided') }),

  /* ---------------- partner preferences (mirror) ---------------- */
  f({ key: 'prefAgeRange', label: 'Age', type: 'text', section: 'preferences', preference: true, placeholder: '24 - 30', sources: PB }),
  f({ key: 'prefHeightRange', label: 'Height', type: 'text', section: 'preferences', preference: true, placeholder: "5'2\" - 5'8\"", sources: PB }),
  f({ key: 'prefMaritalStatus', label: 'Marital status', type: 'multiselect', section: 'preferences', preference: true, options: MARITAL_STATUS, sources: PB }),
  f({ key: 'prefReligion', label: 'Religion', type: 'multiselect', section: 'preferences', preference: true, options: RELIGIONS, sources: PB }),
  f({ key: 'prefMaslak', label: 'Maslak', type: 'multiselect', section: 'preferences', preference: true, options: MASLAK, appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'prefCommunity', label: 'Biradari', type: 'tags', section: 'preferences', preference: true, sources: PB }),
  f({ key: 'prefMotherTongue', label: 'Mother tongue', type: 'multiselect', section: 'preferences', preference: true, options: MOTHER_TONGUES, sources: P }),
  f({ key: 'prefEducation', label: 'Education', type: 'text', section: 'preferences', preference: true, sources: PB }),
  f({ key: 'prefOccupation', label: 'Occupation', type: 'text', section: 'preferences', preference: true, sources: PB }),
  f({ key: 'prefIncome', label: 'Income', type: 'text', section: 'preferences', preference: true, sources: P }),
  f({ key: 'prefLocation', label: 'Location', type: 'tags', section: 'preferences', preference: true, sources: PB }),
  f({ key: 'prefDiet', label: 'Diet', type: 'multiselect', section: 'preferences', preference: true, options: DIETS, sources: P }),
  f({ key: 'prefSmoking', label: 'Smoking', type: 'multiselect', section: 'preferences', preference: true, options: FREQ, sources: P }),
  f({ key: 'prefDrinking', label: 'Drinking', type: 'multiselect', section: 'preferences', preference: true, options: FREQ, sources: P }),
  f({ key: 'prefComplexion', label: 'Complexion', type: 'multiselect', section: 'preferences', preference: true, options: COMPLEXIONS, sources: P }),
  f({ key: 'prefPhysicalStatus', label: 'Physical status', type: 'multiselect', section: 'preferences', preference: true, options: PHYSICAL_STATUS, sources: P }),
  f({ key: 'prefFamilyValues', label: 'Family values', type: 'multiselect', section: 'preferences', preference: true, options: FAMILY_VALUES, sources: P }),
  f({ key: 'prefManglik', label: 'Manglik', type: 'select', section: 'preferences', preference: true, options: MANGLIK, appliesTo: { religion: ['hindu', 'jain', 'sikh'] }, sources: P }),
  f({ key: 'prefHijab', label: 'Hijab / purdah', type: 'select', section: 'preferences', preference: true, options: HIJAB, appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'prefBeard', label: 'Beard', type: 'select', section: 'preferences', preference: true, options: BEARD, appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'prefDeeni', label: 'Deeni expectations', type: 'text', section: 'preferences', preference: true, appliesTo: MUSLIM_ONLY, sources: B }),
  f({ key: 'prefAcceptsChildren', label: 'Accepts children', type: 'select', section: 'preferences', preference: true, options: YES_NO, sources: P }),
  f({ key: 'prefTraits', label: 'Looking for', type: 'tags', section: 'preferences', preference: true,
      placeholder: 'Deendaar, caring, well settled…', sources: PB }),
  f({ key: 'prefNotes', label: 'Anything else', type: 'longtext', section: 'preferences', preference: true, sources: PB }),

  /* ---------------- contact ---------------- */
  f({ key: 'contactPerson', label: 'Contact person', type: 'text', section: 'contact', visibility: 'connected', sources: B }),
  f({ key: 'contactRelation', label: 'Relation to them', type: 'text', section: 'contact', visibility: 'connected', sources: B }),
  f({ key: 'phone', label: 'Phone', type: 'phone', section: 'contact', icon: 'phone', visibility: 'connected', sources: PB }),
  f({ key: 'altPhone', label: 'Alternate phone', type: 'phone', section: 'contact', visibility: 'connected', sources: B }),
  f({ key: 'whatsapp', label: 'WhatsApp', type: 'phone', section: 'contact', visibility: 'connected', sources: B }),
  f({ key: 'email', label: 'Email', type: 'email', section: 'contact', visibility: 'connected', sources: PB }),
  f({ key: 'bestTimeToCall', label: 'Best time to call', type: 'text', section: 'contact', visibility: 'connected', sources: P }),

  /* ---------------- media ---------------- */
  f({ key: 'photos', label: 'Photographs', type: 'image', section: 'media', sources: PB }),
  f({ key: 'voiceNoteUrl', label: 'Voice note', type: 'url', section: 'media', sources: P }),
  f({ key: 'videoUrl', label: 'Video introduction', type: 'url', section: 'media', sources: P }),
  f({ key: 'biodataPdf', label: 'Existing biodata (PDF)', type: 'file', section: 'media', sources: B }),
];

export const REGISTRY: Registry = { sections: SECTIONS, fields: FIELDS };

export const fieldByKey = new Map(FIELDS.map((x) => [x.key, x]));
export const sectionById = new Map(SECTIONS.map((s) => [s.id, s]));
