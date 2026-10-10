import assert from "node:assert/strict";

import { handleError, isValidHandle, normaliseHandle, suggestHandle } from "./handle";

// --- what passes
assert.ok(isValidHandle("mervink99"), "six letters and two digits");
assert.ok(isValidHandle("42sanjaybirdar"), "order does not matter");
assert.ok(isValidHandle("hot_wheels07"), "underscores are allowed and are not letters");
assert.ok(isValidHandle("MervinK99"), "case is normalised before it is judged");

// --- what does not
assert.ok(!isValidHandle(""), "empty");
assert.ok(!isValidHandle("mervin"), "no digits");
assert.ok(!isValidHandle("mervin1"), "one digit is not two");
assert.ok(!isValidHandle("car99"), "five letters is not six");
assert.ok(!isValidHandle("123456789012"), "digits are not letters");
assert.ok(!isValidHandle("mervin k99"), "a space is not in the charset");
assert.ok(!isValidHandle("mervin-k99"), "nor is a hyphen");
assert.ok(!isValidHandle("mervinkalaimani99999999"), "longer than twenty");

// --- the boundaries, which is where a counting rule goes wrong
assert.ok(isValidHandle("abcdef12"), "exactly six letters, exactly two digits");
assert.ok(!isValidHandle("abcde12"), "five letters fails");
assert.ok(!isValidHandle("abcdef1"), "one digit fails");
assert.equal(normaliseHandle("  MerviN  "), "mervin");

// --- the message names the thing that is wrong, and only one thing at a time
assert.match(handleError("mervin") ?? "", /numbers/, "letters are fine, so it asks for numbers");
assert.match(handleError("ab12") ?? "", /letters/, "digits are fine, so it asks for letters");
assert.match(handleError("mervin-k99") ?? "", /lowercase letters/, "charset is named first");
assert.equal(handleError("abcdef12"), null);

// --- the suggestion is always valid, which is the only thing it must be
for (const bad of ["mervin", "sam", "", "99", "a_b", "samjjladot", "sanjaybirdar"]) {
  const s = suggestHandle(bad);
  assert.equal(handleError(s), null, `suggestion for "${bad}" is itself invalid: ${s}`);
}
assert.equal(suggestHandle("mervin"), "mervin00", "letters kept, digits appended");
assert.equal(suggestHandle("sam"), "samsam00", "padded from its own letters");
assert.equal(suggestHandle("mervin7"), "mervin70", "a digit already there is used");
assert.equal(suggestHandle("mervin"), suggestHandle("mervin"), "same in, same out");
assert.ok(suggestHandle("mervinkalaimanisverylongname").length <= 20, "stays within the cap");

console.log("ok — 28 checks");
