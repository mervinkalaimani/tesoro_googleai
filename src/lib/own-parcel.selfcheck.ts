/**
 * A parcel reference is one person's.
 *
 * The owners list is admin-visible and names everybody who owns a casting.
 * `ownParcel` is the line that keeps the shipping ID on the reader's own row
 * and off everyone else's, so the line gets a check.
 */
import { ownParcel } from "@/components/catalog-owners-dialog";

let failed = 0;
const check = (name: string, got: string, want: string) => {
  if (got === want) return;
  failed++;
  console.error(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
};

const me = "uid-me";
const ship = { blister: "KZ/240501/01", "5 pack": "KZ/240714/02" };

check("my row, my box", ownParcel({ auth_uid: me, assortment: "Blister" }, me, ship), ship.blister);
check(
  "my row, other box",
  ownParcel({ auth_uid: me, assortment: "5 Pack" }, me, ship),
  ship["5 pack"],
);
check(
  "somebody else's row",
  ownParcel({ auth_uid: "uid-them", assortment: "Blister" }, me, ship),
  "",
);
check("nobody signed in", ownParcel({ auth_uid: me, assortment: "Blister" }, null, ship), "");
check("no parcel known", ownParcel({ auth_uid: me, assortment: "Blister" }, me, {}), "");

// The box names come from two places and need not agree. One parcel is still
// unambiguously the answer; two are not, and guessing would be worse than silence.
check(
  "one parcel, box does not line up",
  ownParcel({ auth_uid: me, assortment: "Blister Pack" }, me, { blister: ship.blister }),
  ship.blister,
);
check(
  "two parcels, box does not line up",
  ownParcel({ auth_uid: me, assortment: "Qube Carz" }, me, ship),
  "",
);
check(
  "row with no box at all",
  ownParcel({ auth_uid: me, assortment: "" }, me, { "": ship.blister }),
  ship.blister,
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("own-parcel: 8 checks pass");
