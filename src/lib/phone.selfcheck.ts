import { strict as assert } from "node:assert";

import { COUNTRIES, countryOf, flagOf, formatPhone, parsePhone } from "./phone";

// ---- the table itself ----
assert.equal(COUNTRIES[0]!.iso2, "IN", "India is first: it is where most of this app is");
for (const c of COUNTRIES) {
  assert.match(c.dial, /^\d{1,4}$/, `${c.iso2} has a dialling code`);
  assert.ok(c.min >= 7 && c.max >= c.min && c.max <= 12, `${c.iso2} has a sane length`);
  assert.match(c.iso2, /^[A-Z]{2}$/);
}
assert.equal(new Set(COUNTRIES.map((c) => c.iso2)).size, COUNTRIES.length, "no country twice");

// ---- the flag is the two letters, shifted ----
assert.equal(flagOf("IN"), "\u{1F1EE}\u{1F1F3}");
assert.equal([...flagOf("GB")].length, 2, "two regional indicators, not a string of letters");

// ---- splitting a stored number ----
// The longest code wins, so +1 cannot claim a number that is +971's.
assert.deepEqual(parsePhone("+971501234567"), { iso2: "AE", national: "501234567" });
assert.deepEqual(parsePhone("+919876543210"), { iso2: "IN", national: "9876543210" });
// The United States and Canada share +1 and nothing in the number says
// which; the list decides, and it says the bigger one.
assert.deepEqual(parsePhone("+12125551234"), { iso2: "US", national: "2125551234" });

// Spaces, brackets and dashes are not part of a number.
assert.deepEqual(parsePhone("+91 98765 43210"), { iso2: "IN", national: "9876543210" });

// Ten digits with no code at all — what the rows written before this field
// look like. "91" there is the start of somebody's mobile, not a country, so
// the whole thing stays the number.
assert.deepEqual(parsePhone("+8939003133"), { iso2: "IN", national: "8939003133" });
assert.deepEqual(parsePhone("9176543210"), { iso2: "IN", national: "9176543210" });

// Nothing is nothing, not a country with an empty number pretending to be one.
assert.deepEqual(parsePhone(""), { iso2: "IN", national: "" });
assert.deepEqual(parsePhone(null), { iso2: "IN", national: "" });
assert.deepEqual(parsePhone("   "), { iso2: "IN", national: "" });

// ---- and putting it back ----
assert.equal(formatPhone("IN", "9876543210"), "+919876543210");
assert.equal(formatPhone("AE", "50 123 4567"), "+971501234567");
assert.equal(formatPhone("IN", ""), "", "no number is no number, not a bare dialling code");
assert.equal(formatPhone("ZZ", "9876543210"), "+919876543210", "an unknown country is the default");

// A number survives the round trip it is put through every time the form opens
// and saves.
for (const stored of ["+919876543210", "+971501234567", "+6598765432"]) {
  const { iso2, national } = parsePhone(stored);
  assert.equal(formatPhone(iso2, national), stored, `${stored} round-trips`);
}

// The limit shown in the field is the country's, and it is India's by default.
assert.equal(countryOf("IN").max, 10);
assert.equal(countryOf("SG").max, 8);
assert.equal(countryOf("nope").iso2, "IN");

console.log("phone selfcheck: ok");
