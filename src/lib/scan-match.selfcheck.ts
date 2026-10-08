/**
 * The matcher's job is to say no.
 *
 * Run with: npx tsx src/lib/scan-match.selfcheck.ts
 */
import assert from "node:assert/strict";

import { MAX_MATCHES, matchScannedCar, sameName, type MatchableCar } from "./scan-match";

const car = (c: Partial<MatchableCar>): MatchableCar => c as MatchableCar;

const collection: MatchableCar[] = [
  car({
    name: "'64 Lincoln Continental",
    make: "Lincoln",
    model: "Continental",
    brand: "Hot Wheels",
    colour: "Black",
    year: "1964",
    series: "The Matrix",
  }),
  car({
    name: "Lincoln Continental",
    make: "Lincoln",
    model: "Continental",
    brand: "Hot Wheels",
    colour: "Red",
  }),
  car({
    name: "Toyota FJ Cruiser",
    make: "Toyota",
    model: "FJ Cruiser",
    brand: "Matchbox",
    colour: "Silver",
  }),
  car({ name: "Honda Civic", make: "Honda", model: "Civic", brand: "Hot Wheels", colour: "Black" }),
  car({ name: "Porsche 911", make: "Porsche", model: "911", brand: "Hot Wheels", colour: "Black" }),
  car({ name: "Datsun 510", make: "Datsun", model: "510", brand: "Hot Wheels", colour: "Black" }),
];

// WHOLE WORDS, NOT SUBSTRINGS. The bug that started this: a one-letter model
// read off a blurry card matched every car with that letter in its name.
assert.equal(sameName("E", "Continental"), false, "a letter is not a name");
assert.equal(sameName("Continental", "Continental"), true);
assert.equal(sameName("FJ Cruiser", "Toyota FJ Cruiser"), true, "one is whole words of the other");
assert.equal(sameName("Civic", "Honda Civic"), true);
assert.equal(sameName("Civic", "Porsche 911"), false);
assert.equal(sameName("", "Civic"), false);

// A colour and a brand are not a car. Four of these six are black Hot Wheels,
// and none of them is the scanned car.
const matches = matchScannedCar(
  { make: "Lincoln", model: "Continental", brand: "Hot Wheels", colour: "Black", year: "1964" },
  collection,
);
assert.equal(matches.length, 2, "only the two Continentals");
assert.equal(matches[0]!.car.colour, "Black", "the one that agrees on colour and year comes first");

// Nothing to match on is no match, not every car.
assert.equal(matchScannedCar({ colour: "Black", brand: "Hot Wheels" }, collection).length, 0);
assert.equal(matchScannedCar(null, collection).length, 0);
assert.equal(matchScannedCar({}, collection).length, 0);

// A make with nothing to corroborate it is a brand of car, not a car.
assert.equal(matchScannedCar({ make: "Lincoln" }, collection).length, 0);
assert.equal(
  matchScannedCar({ make: "Lincoln", year: "1964" }, collection).length,
  1,
  "the make and one agreeing fact",
);

// The model decides; a disagreeing colour does not throw the match away.
const fj = matchScannedCar({ model: "FJ Cruiser", make: "Toyota", colour: "Blue" }, collection);
assert.equal(fj.length, 1);
assert.deepEqual(
  fj[0]!.matched.map((m) => m.label),
  ["Model", "Make"],
  "and the chips say what actually agreed",
);

// Five at most, however many agree.
const many = Array.from({ length: 20 }, (_, i) =>
  car({ name: `Continental ${i}`, make: "Lincoln", model: "Continental", brand: "Hot Wheels" }),
);
assert.equal(matchScannedCar({ model: "Continental" }, many).length, MAX_MATCHES);
assert.equal(matchScannedCar({ model: "Continental" }, many, 2).length, 2);

console.log("scan-match selfcheck: ok");
