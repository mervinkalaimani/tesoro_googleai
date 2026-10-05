import assert from "node:assert/strict";

import { activeSection } from "./editor-rail";

const tops = [
  { id: "car", top: -300 },
  { id: "assortments", top: -40 },
  { id: "multipack", top: 120 },
  { id: "seller", top: 480 },
];

// The last heading past the line, not the first one still on screen.
assert.equal(activeSection(tops), "assortments");

// At the very top, nothing has passed the line yet and the first still wins.
assert.equal(
  activeSection([
    { id: "car", top: 0 },
    { id: "assortments", top: 400 },
  ]),
  "car",
);
assert.equal(
  activeSection([
    { id: "car", top: 60 },
    { id: "assortments", top: 400 },
  ]),
  "car",
);

// Scrolled to the bottom, the last section is current even if it is short.
assert.equal(
  activeSection([
    { id: "car", top: -900 },
    { id: "photo", top: -20 },
  ]),
  "photo",
);

// A threshold moves the line down the scrollport: a sticky header's height.
assert.equal(activeSection(tops, 200), "multipack");

// Nothing to choose from is not an error, it is no rail.
assert.equal(activeSection([]), "");

console.log("editor-rail selfcheck: ok");
