import { strict as assert } from "node:assert";

import { mentionsCar } from "./image-relevance";

const car = { make: "Land Rover", model: "Defender" };

// The ones that were on screen.
assert.equal(mentionsCar("Land And Farm Delaware at Nancy Sheridan blog", car), false);
assert.equal(mentionsCar("Premium Photo | A photo of Farm and Ranch Land", car), false);
assert.equal(mentionsCar("Free Images : natural landscape, grassland, field", car), false);

// The ones that should be.
assert.equal(mentionsCar("Hot Wheels Land Rover Defender 90 Red GHB38", car), true);
assert.equal(mentionsCar("LAND ROVER DEFENDER 90 GTC26.jpg", car), true);

// A listing that drops the trim is still the car.
assert.equal(mentionsCar("Porsche 911 1:64 diecast", { make: "Porsche", model: "911 GT3" }), true);

// No model: every word of the make, so "land" alone is not a Land Rover.
assert.equal(mentionsCar("Farm land for sale", { make: "Land Rover" }), false);
assert.equal(mentionsCar("Land Rover restoration", { make: "Land Rover" }), true);

// Nothing to judge by keeps everything; an untitled result has nothing to say.
assert.equal(mentionsCar("anything at all", {}), true);
assert.equal(mentionsCar("", car), false);

// Punctuation and case are not the difference between two cars.
assert.equal(mentionsCar("Mini GT — M3 (E46) blue", { make: "BMW", model: "M3 (E46)" }), true);

console.log("image-relevance selfcheck: ok");
