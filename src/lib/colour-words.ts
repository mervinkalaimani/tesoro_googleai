/**
 * Is what somebody typed in the Colour box a colour?
 *
 * The box takes free text on purpose — a casting's colour is "Spectraflame
 * Red", "Rosso Corsa", "Midnight Purple", and a fixed list would never hold
 * them. What it should not take is a different kind of word: the model, the
 * series, the seller, half a sentence. Those are what make a collection
 * unsearchable by colour, one row at a time.
 *
 * So the rule is one word deep. A value passes when any word in it is a colour
 * word, whatever else sits beside it and whatever language it is in: "Rosso
 * Corsa" passes on rosso, "Off-White" on white, "Dark Green Metallic" on green.
 * "Bone Shaker" and "GT-R" have no colour word in them, and are the thing this
 * is for.
 *
 * Deliberately not a spell-checker. "Redd" is refused and so is "Yelow", which
 * is why the form also accepts any colour already in your collection — what you
 * have used before stays usable, typo and all.
 */

/**
 * Colour words, one per line of thought rather than one per language: English
 * and its paint-shop vocabulary first, then the basic colour terms of the
 * languages a diecast box is printed in, romanised where the script would not
 * survive a keyboard.
 *
 * Casting names that happen to read as colours are left out on purpose — no
 * "bone" (Bone Shaker), no "flame", no "steel" — since the point is to catch a
 * name typed into the colour box.
 */
const COLOUR_WORDS = [
  // Red through pink
  "red",
  "crimson",
  "scarlet",
  "maroon",
  "burgundy",
  "ruby",
  "cherry",
  "wine",
  "rose",
  "pink",
  "magenta",
  "fuchsia",
  "salmon",
  "coral",
  "blush",
  // Orange, yellow, and the metals that read as them
  "orange",
  "amber",
  "tangerine",
  "apricot",
  "peach",
  "rust",
  "copper",
  "bronze",
  "brass",
  "gold",
  "golden",
  "mustard",
  "yellow",
  "lemon",
  // Neutrals and creams
  "cream",
  "ivory",
  "beige",
  "tan",
  "sand",
  "sandal",
  "khaki",
  "wheat",
  "champagne",
  "nude",
  // Green
  "green",
  "lime",
  "olive",
  "emerald",
  "jade",
  "mint",
  "sage",
  "seafoam",
  // Blue and cyan
  "teal",
  "turquoise",
  "aqua",
  "aquamarine",
  "cyan",
  "blue",
  "navy",
  "azure",
  "cobalt",
  "indigo",
  "sapphire",
  "cerulean",
  "slate",
  // Purple
  "purple",
  "violet",
  "lavender",
  "lilac",
  "plum",
  "mauve",
  "orchid",
  "amethyst",
  // Brown
  "brown",
  "chocolate",
  "coffee",
  "mocha",
  "chestnut",
  "walnut",
  "sienna",
  "umber",
  "taupe",
  // Black, white, and the greys
  "black",
  "jet",
  "onyx",
  "charcoal",
  "graphite",
  "gunmetal",
  "grey",
  "gray",
  "silver",
  "chrome",
  "white",
  "snow",
  "pearl",
  "platinum",
  "titanium",
  "nickel",
  "zamac",
  // How the paint was put on, which is half of what is written on a card
  "metallic",
  "matte",
  "matt",
  "gloss",
  "glossy",
  "satin",
  "pearlescent",
  "iridescent",
  "chameleon",
  "candy",
  "neon",
  "fluorescent",
  "spectraflame",
  "clear",
  "transparent",
  "translucent",
  "smoke",
  "tinted",
  "camo",
  "camouflage",
  "rainbow",
  "multicolour",
  "multicolor",
  "multi",
  "twotone",
  "duotone",
  "unpainted",
  "primer",
  "glitter",
  "sparkle",
  "holographic",
  "holo",
  "anodised",
  "anodized",
  // Nothing known, which is an answer
  "unknown",
  "none",
  "na",
  "assorted",
  "various",
  "mixed",
  // Spanish
  "rojo",
  "roja",
  "azul",
  "verde",
  "amarillo",
  "negro",
  "negra",
  "blanco",
  "blanca",
  "gris",
  "morado",
  "rosado",
  "naranja",
  "marron",
  "plateado",
  "dorado",
  // French
  "rouge",
  "bleu",
  "bleue",
  "vert",
  "verte",
  "jaune",
  "noir",
  "noire",
  "blanc",
  "blanche",
  "argent",
  "argente",
  "dore",
  // German
  "rot",
  "blau",
  "gruen",
  "grun",
  "gelb",
  "schwarz",
  "weiss",
  "grau",
  "lila",
  "braun",
  "silber",
  "tuerkis",
  "turkis",
  // Italian
  "rosso",
  "rossa",
  "azzurro",
  "giallo",
  "nero",
  "nera",
  "bianco",
  "bianca",
  "grigio",
  "viola",
  "marrone",
  "argento",
  "oro",
  "arancione",
  // Portuguese
  "vermelho",
  "amarelo",
  "preto",
  "branco",
  "cinza",
  "roxo",
  "marrom",
  "prata",
  "ouro",
  "laranja",
  // Dutch
  "rood",
  "blauw",
  "groen",
  "geel",
  "zwart",
  "wit",
  "grijs",
  "paars",
  "bruin",
  "zilver",
  "goud",
  // Japanese
  "aka",
  "akai",
  "ao",
  "aoi",
  "midori",
  "kiiro",
  "kiiroi",
  "kuro",
  "kuroi",
  "shiro",
  "shiroi",
  "haiiro",
  "murasaki",
  "momoiro",
  "chairo",
  "kin",
  "gin",
  // Mandarin
  "hong",
  "lan",
  "huang",
  "hei",
  "bai",
  "hui",
  "cheng",
  "jin",
  "yin",
  // Korean
  "ppalgan",
  "paran",
  "norang",
  "chorok",
  "kkaman",
  "hayan",
  "bora",
  // Hindi
  "lal",
  "laal",
  "neela",
  "nila",
  "hara",
  "peela",
  "pila",
  "kala",
  "kaala",
  "safed",
  "bhura",
  "gulabi",
  "sunehra",
  "chandi",
  "saleti",
  "narangi",
  // Tamil
  "sivappu",
  "neelam",
  "pachai",
  "manjal",
  "karuppu",
  "vellai",
  "oodha",
  // Russian
  "krasny",
  "siny",
  "zeleny",
  "zhelty",
  "cherny",
  "bely",
  "sery",
  "fioletovy",
  "korichnevy",
  "serebro",
  "zoloto",
  // Arabic
  "ahmar",
  "azraq",
  "akhdar",
  "asfar",
  "aswad",
  "abyad",
  "ramadi",
  "banafsaji",
  "bunni",
  "fiddi",
  "dhahabi",
];

const WORDS = new Set(COLOUR_WORDS);

/** Accents off and case down, so "Doré" and "grün" are the words already listed. */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** One colour word, allowing the English "-ish" and a plural. */
function isColourWord(word: string): boolean {
  if (WORDS.has(word)) return true;
  if (word.endsWith("ish") && WORDS.has(word.slice(0, -3))) return true;
  if (word.endsWith("s") && WORDS.has(word.slice(0, -1))) return true;
  return false;
}

/**
 * True for a value with a colour in it, and for an empty one — the box is
 * optional, and refusing to save a blank field is not the same as refusing a
 * wrong one.
 */
export function looksLikeColour(value: string): boolean {
  const clean = plain(value).trim();
  if (!clean) return true;
  // "n/a" is two words to a split on non-letters, and neither is "na".
  if (clean.replace(/[^a-z]/g, "") === "na") return true;
  return clean
    .split(/[^a-z]+/)
    .filter(Boolean)
    .some(isColourWord);
}
