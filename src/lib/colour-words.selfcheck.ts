/**
 * What the Colour box will and will not take. The interesting cases are the
 * ones that look like the other kind: a casting name with a colour word buried
 * in it, and a colour phrase with no plain English colour in it at all.
 *
 *   npx esbuild src/lib/colour-words.selfcheck.ts --bundle --format=esm \
 *     --platform=node --alias:@=./src --outfile=.selfcheck.mjs && node .selfcheck.mjs
 */
import assert from "node:assert";

import { looksLikeColour } from "@/lib/colour-words";

const takes = (v: string) => assert.equal(looksLikeColour(v), true, `should take "${v}"`);
const refuses = (v: string) => assert.equal(looksLikeColour(v), false, `should refuse "${v}"`);

// A colour, however it is dressed up.
takes("Red");
takes("red");
takes("Spectraflame Red");
takes("Dark Green Metallic");
takes("Off-White");
takes("Midnight Purple");
takes("Gunmetal Grey");
takes("Reddish Brown");
takes("Two-Tone Blue/White");
takes("Chrome");
takes("Unknown");
takes("NA");
takes("N/A");
// Blank is not wrong, it is unanswered.
takes("");
takes("   ");

// Another language, including one romanised off its own script.
takes("Rosso Corsa");
takes("rojo");
takes("Bleu de France");
takes("grün");
takes("Doré");
takes("kuro");
takes("Sivappu");
takes("Gulabi");

// What this is for: a name, a number, a sentence.
refuses("Nissan Skyline");
refuses("GT-R");
refuses("Bone Shaker");
refuses("Hot Wheels");
refuses("Mustang" /* the word "tan" is inside it, and inside is not a word */);
refuses("Gran Turismo");
refuses("1133");
refuses("asdfgh");
refuses("came in a blister pack");
// Near-misses stay refused; the form's own escape is a colour already in use.
refuses("Yelow");
refuses("Redd");

console.log("colour-words: a colour word anywhere passes, a name nowhere does.");
