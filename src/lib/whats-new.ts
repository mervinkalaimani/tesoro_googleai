/**
 * What changed, in the words of somebody who uses the app.
 *
 * Hand-written rather than generated from commits: a commit subject is written
 * for whoever is reading the log, and half of them are about a file. One entry
 * per day of work, the build number being the commit count that built it, so
 * two people comparing screens can say which one is behind.
 *
 * `key` marks the two or three things in a release worth stopping on. If
 * everything is marked, nothing is.
 *
 * `admin` is for changes to screens only an admin can open. Telling everybody
 * about a metadata editor they cannot reach is noise at best, and at worst it
 * reads as something of theirs that is broken.
 */
export type Change = { text: string; key?: boolean; admin?: boolean };

export type Release = {
  /** Commits at the time of the build. Monotonic, and it matches the deploy. */
  build: number;
  /** Local time of the push, ISO without a zone. */
  at: string;
  changes: Change[];
};

/** Newest first. */
export const RELEASES: Release[] = [
  {
    build: 268,
    at: "2026-10-05T14:00",
    changes: [
      {
        key: true,
        text: "Add a car, update a car and file a casting are one editor now: the sections down the left with what is in each, the form in the middle, and on the right the thing you are filing — its picture, its status, its seller, its price — with the save button under it.",
      },
      {
        text: "Under that picture is what is still missing, each one a tap from the field that fixes it, so “why can I not save this” is answered before you press anything. When nothing is missing it says so.",
      },
      {
        text: "Every section starts open. Updating a car opens on Seller & payment, which is what you came for; what the car is stays one section up, out of the way.",
      },
      {
        text: "On a phone the sections become a row of chips with a dot on the ones still needing an answer, and what is missing sits above the buttons at the bottom of the screen.",
      },
    ],
  },
  {
    build: 267,
    at: "2026-10-02T21:30",
    changes: [
      {
        key: true,
        text: "Reading a card from a photograph can now go through an OmniRoute server instead of Google’s — an OpenAI-compatible router that picks a provider and falls back between them itself. Name one and the scan asks it first; name nothing and the scan is exactly what it was.",
      },
      {
        text: "With both set up, the router goes first and Gemini catches what it drops. Naming a router means wanting it used, not wanting it to be the only thing between a photograph and an answer.",
      },
    ],
  },
  {
    build: 266,
    at: "2026-10-02T08:30",
    changes: [
      {
        key: true,
        text: "Six old backup tables were readable by anybody with the public key, and two of them were copies of collection rows — what was paid, who it was bought from, which parcel it came in. They are closed. Nothing was lost: the tables are still there, and only the server reads them now.",
      },
      {
        text: "Two database functions that could be called without signing in no longer can be. One of them wrote to collections.",
      },
      {
        text: "A price range of one price is no longer published. Two buyers who paid the same is not a range — it is both of their receipts — so it is withheld, the way a single buyer’s already was. Twelve castings were showing one.",
      },
      {
        text: "A casting page for an ID that does not exist now answers 404 instead of pretending to be a page, every casting page names its own canonical address, and the description reads “an orange” rather than “a orange”.",
      },
      {
        text: "Every response now carries the usual protective headers.",
      },
    ],
  },
  {
    build: 265,
    at: "2026-10-01T11:15",
    changes: [
      {
        key: true,
        text: "A casting can now say which case it shipped in. Case / Mix was only ever a fact about your copy — which carton it came out of — and it is also a fact about the release, printed on the box before anybody owns one. It sits under Release status when you file or edit a casting, and reads back on the casting’s own page.",
      },
      {
        text: "The box suggests the case names already in use, from the catalogue and from collections, so one carton is not filed four ways. Your own car’s Case / Mix is untouched by it: saving a casting never writes to your row.",
      },
    ],
  },
  {
    build: 264,
    at: "2026-10-01T10:30",
    changes: [
      {
        key: true,
        text: "The catalogue and My Cars can be sorted by series and by sub-series. Both were filterable and groupable and neither was sortable, which is the one of the three that answers “what is this set missing”. A car filed under no series sorts last, not first.",
      },
      {
        text: "Who owns a casting now shows, under your own name and nowhere else, the parcel your copy came in. Press it and the order opens, the same screen the shipping ID on a car has always opened.",
      },
    ],
  },
  {
    build: 263,
    at: "2026-10-01T09:15",
    changes: [
      {
        key: true,
        text: "Merging from a casting's own page now asks which of the two to keep, the same way the Duplicates screen does. It only ever folded the other entry in and kept this one — and which of two entries deserves to be the keeper is a judgement you can only make looking at both.",
      },
      {
        text: "What the merge moves is counted for whichever way round you pick, and recounted when you flip it.",
      },
    ],
  },
  {
    build: 262,
    at: "2026-10-01T08:30",
    changes: [
      {
        key: true,
        text: "Castings are back to grouping only where they were told to. Letting the description decide broke Fast & Furious worst of all — a Silver Series car, a Premium and a Mainline of one set read as one casting in three boxes when they are three products — so the 1,637 entries that were marked as their own casting are marked again, exactly as they were.",
      },
      {
        text: "Merging duplicates is wider, and the description under each name is no longer cut off. Brand, box, series, sub-series and number is the whole of what tells two near-identical entries apart.",
      },
    ],
  },
  {
    build: 261,
    at: "2026-10-01T08:05",
    changes: [
      {
        key: true,
        text: 'Duplicate castings can be searched, and commas narrow: "hot wheels, skyline, premium" is three conditions and none of them has to land in the same field. Sixteen groups with two filter buttons was not a list you could get through.',
      },
      {
        text: "A similar casting now reads the whole set. The sub-series was printed in the reason and then not read, so a Circuit Legends 911 was offered as a near-match for a Le Mans one — and a shared sub-series under a blank series was not offered at all.",
      },
    ],
  },
  {
    build: 260,
    at: "2026-10-01T07:10",
    changes: [
      {
        key: true,
        text: "Add to ISO became Remove ISO once the casting is on your list. The button used to disappear, which read as done and left no way off the list from the catalogue at all — the wish could only be dropped by finding its row in My Cars.",
      },
      {
        text: 'A set is part of what makes a casting. Hot Wheels prints a position rather than a number, so with no number to go on the Silver Series Skyline GT-R from Fast & Furious was clubbing with the Premium one from Pop Culture on the strength of "GT-R" and "Silver" alone — and showing two boxes for a car sold in one.',
      },
    ],
  },
  {
    build: 259,
    at: "2026-10-01T06:20",
    changes: [
      {
        key: true,
        text: 'Castings group again. A flag meaning "this one only looks like that one" was set on 1,637 of 1,639 catalogue entries, so every entry was its own casting and no box ever joined another — the Bathurst 12H AMG GT3 drew as a Blister and a Box rather than as one car in two boxes. The catalogue now reads 1,513 castings instead of 1,639.',
      },
      {
        text: "Detaching a box now holds on the details page too. The card and the page had two different ideas of what one casting is, and only the card was honouring the flag.",
      },
    ],
  },
  {
    build: 258,
    at: "2026-10-01T05:10",
    changes: [
      {
        key: true,
        text: "A catalogue entry opens in the same window a car you own does: the name heads it, the photograph holds the left, and Details, What's Inside and Record sit on the right.",
      },
      {
        text: "The colours and the boxes a casting comes in are now things you pick, and what you pick is what Add files — the red one in the blister, not whichever entry the card stood for.",
      },
      {
        text: "Linking a car to a catalogue entry that is known in several colours asks which one it is, instead of quietly taking the first.",
      },
      {
        text: "One shelf under both pages, and it is the narrowest thing that holds: the set when the set has more than three cars, else the series, else the casting's own make and model.",
      },
      {
        text: "Every field reads caption on the left, answer on the right, on a phone and on a wide screen alike.",
      },
    ],
  },
  {
    build: 257,
    at: "2026-10-01T04:00",
    changes: [
      {
        text: "A car's window is as tall as what is in it. It was a fixed 88% of the screen, so a car with four fields sat above a field of nothing.",
      },
      {
        text: "The size joins the line that says which car this is — Mini GT · 915 · Blister · 1:64 — instead of being the fifth field of the description.",
      },
    ],
  },
  {
    build: 256,
    at: "2026-10-01T03:30",
    changes: [
      {
        text: "On a phone the glow stays where it is while the sheet slides over it, and the sheet is frosted, so the warmth reads through the panel rather than scrolling away with it.",
      },
      {
        text: "OLED is a phone's option now. A backlit screen saves nothing on a black pixel, so it is offered and applied only where it is worth having; the same account on a wide screen reads it as plain dark.",
      },
      {
        text: "On a car's page the tab switch is exactly as wide as what it switches, and the close button sits at the top corner of the photograph.",
      },
    ],
  },
  {
    build: 255,
    at: "2026-10-01T02:50",
    changes: [
      {
        key: true,
        text: "A multipack gets a tab of its own: In the Box lists what is inside it, one car to a line with the catalogue's ID beside it. Only a box has the tab.",
      },
      {
        text: "Every copy you own now reads on the Record tab — when you bought them, in which parcel, and how many came in each.",
      },
    ],
  },
  {
    build: 254,
    at: "2026-10-01T02:10",
    changes: [
      {
        text: "One shelf under a car rather than two, and it is the closest relation there is: the same brand in the same series.",
      },
      {
        text: "The photograph is 4:3 and keeps that shape whatever the tab beside it comes to. On a phone it fills the frame.",
      },
      { text: "The courier link takes the accent colour, like every other link on the page." },
    ],
  },
  {
    build: 253,
    at: "2026-10-01T01:30",
    changes: [
      {
        key: true,
        text: "A car's page reads in three: Details is what the casting is, Purchase is what it cost and how it got here, Record is which row and which casting it is. One at a time, from a switch beside the name, so no tab is a wall of small print.",
      },
      {
        text: "The photograph shows the whole card art now — the number and the logo are printed at its edges, and filling the frame cropped exactly those off.",
      },
      {
        text: "On a phone the sheet carries a warm glow behind it. A phone is held close and holds one thing at a time; the wide layout carries columns of its own and stays plain.",
      },
    ],
  },
  {
    build: 252,
    at: "2026-10-01T00:20",
    changes: [
      {
        text: "A car with no courier leaves that space blank instead of pulling its dates and IDs out of line. Every fact on the purchase now has a place of its own, on the phone as well as the wide layout.",
      },
    ],
  },
  {
    build: 248,
    at: "2026-09-30T23:30",
    changes: [
      {
        key: true,
        text: "A fourth appearance: OLED. Dark with the background turned all the way off, for a screen that lights every pixel itself — the text and the accent stay exactly as they were. Settings → Display.",
      },
      {
        text: "What a car cost now carries the gap to its retail price in brackets beside it, instead of spending a third of the row on a field of its own.",
      },
      {
        text: "On a phone, who sold it and who carried it read on one line.",
      },
      {
        text: "A car's ID drops the six characters of owner prefix that every car in your collection shares.",
      },
    ],
  },
  {
    build: 247,
    at: "2026-09-30T22:15",
    changes: [
      {
        key: true,
        text: "A car's own page is redesigned. The photograph is the size of the card art, and beside it the name, the status, rarity and favourite as three chips you can tap, and what the casting is. Under them the purchase reads across the page, with the IDs and who filed the casting in a column of the same width beside it, and what else is like it along the bottom as shelves you flick.",
      },
      {
        text: "View in Catalogue is the Catalogue ID now: the journey is named after where it lands rather than after the button.",
      },
    ],
  },
  {
    build: 246,
    at: "2026-09-30T20:30",
    changes: [
      {
        text: "A casting opened from anywhere but the catalogue sat left of centre in its own window: the column kept the gutter meant for the shelves beside it, and the scrollbar took its 10px from one side only. Both are even now.",
      },
    ],
  },
  {
    build: 245,
    at: "2026-09-30T19:45",
    changes: [
      {
        key: true,
        admin: true,
        text: "A casting's details page now offers the other entries that look like another box of it, with one tap to attach them. The brand and the collector number agreeing names one product, so that is offered as certain; the same make and model with nothing contradicting is offered as a guess. Hot Wheels and Matchbox are left out, because their number is a position in a series and not a product.",
      },
      {
        text: "Adding a car by hand also watches the brand, the make and the series: the same make in the same series now comes back as a possible duplicate, where before only the whole description or the collector number counted.",
      },
      {
        text: "A possible duplicate stays on screen as one line while you fill in what you paid, instead of scrolling away with the entries. Scroll back up to read them.",
      },
    ],
  },
  {
    build: 244,
    at: "2026-09-30T16:30",
    changes: [
      {
        key: true,
        text: "Moving a car into another box moves its catalogue ID with it: the ID carries the box in one of its slots, so a Blister kept the Box's ID and now takes the Blister's — that box's entry when the catalogue has one, a new ID derived from the box when it does not.",
      },
      {
        text: "Assortments are a list somebody keeps rather than whatever has been typed. You pick from the list; only an admin can add to it, and typing a new one now files it as a box instead of leaving a name that is in every picker and no list.",
      },
      { text: "Cars inside packs is now Combine multi pack, and reads the way round it sounds." },
      { text: "Catalog is spelt Catalogue." },
      {
        admin: true,
        text: "Every assortment has been detached from its casting, so each one stands as its own card.",
      },
    ],
  },
  {
    build: 243,
    at: "2026-09-30T15:40",
    changes: [
      {
        key: true,
        text: "An Assortments chip in the catalogue, beside Cars inside packs: on, the boxes of one casting ride on one card; off, every box is its own card with its own ID, price and colours.",
      },
      {
        key: true,
        text: "A casting taken out of its group now draws its own card. Detaching three Durangos and still seeing one was the card drawing ignoring what detaching means.",
      },
      {
        text: "A casting's window shows the ID its boxes share, and each box's own colours beside it — the Box in six colours and the Blister in two are two answers, not one.",
      },
      {
        text: "Adding a car offers the colours of the box you picked before the rest.",
      },
      {
        text: "The brand shelf and the chip rows no longer draw a scrollbar under themselves.",
      },
    ],
  },
  {
    build: 242,
    at: "2026-09-30T14:05",
    changes: [
      {
        key: true,
        text: "A colour no longer makes a second casting. Filing the red one of a casting the catalogue holds in yellow keeps the same catalogue ID and adds red to the colours that casting comes in — and the colour on your car stays the one you own, which the catalogue used to write over every time it was saved.",
      },
      {
        key: true,
        text: "Adding or editing a car asks which box yours came out of when the casting is sold in more than one, instead of listing them all as rows to fill in. Picking one brings its price and files the car under it.",
      },
      {
        text: "My Cars keeps the boxes apart: the Box and the Blister of one casting are two things you own, not one owned twice.",
      },
      {
        admin: true,
        text: "Filing a casting in a second box is the catalogue's window now; the car form no longer offers to delete other people's entries when Multipack is ticked.",
      },
    ],
  },
  {
    build: 241,
    at: "2026-09-29T22:15",
    changes: [
      {
        key: true,
        text: "A photo can be pasted straight onto a car you are looking at: copy a picture, open the car, press Ctrl+V. On a catalogue casting only an admin can, since that photo is the one every collection shows.",
      },
      {
        text: "My Cars, the catalogue and Pre Orders can be sorted by the number on the card, up or down. 042 and 42 are the same number, #80 is the number 80, and a car with no number stays at the bottom either way.",
      },
      {
        text: "Expected by opens seven months instead of two years of them, with the rest a scroll away.",
      },
    ],
  },
  {
    build: 239,
    at: "2026-09-29T22:30",
    changes: [
      {
        text: "Adding or editing a car or a casting keeps the name of what you are working on at the top of the window while you scroll through the rest of it.",
      },
      {
        text: "That line now ends with the colour, after the number — the number alone does not say which release is in your hand.",
      },
    ],
  },
  {
    build: 238,
    at: "2026-09-29T21:35",
    changes: [
      {
        key: true,
        text: "A picture can be pasted. Copy a photo — a screenshot, or a right-click-copy off a listing — and press Ctrl+V while adding or editing a car, a casting or a seller. There is a Paste button beside Choose a file for anyone who would rather click.",
      },
      {
        key: true,
        text: "A CSV import no longer files a car you already own as a new casting. Hotwheels and Hot Wheels are the same brand now, and a column your sheet left blank is no longer read as a difference.",
      },
      {
        text: "The import preview says when it had to guess: an amber 1 of 4 beside a row, and a catalogue ID you can click to see the casting it picked.",
      },
      {
        key: true,
        text: "Sellers is a shop now: store name, phone, WhatsApp, location and a picture, with how many pre-orders and how many are still coming. The seller's name opens all of it.",
      },
      {
        text: "Shipping is shown against the order it belongs to, not repeated on every car in it.",
      },
      {
        text: "The login page asks who you are before it asks for a password: the people who use this device, as faces.",
      },
      {
        text: "Scan a card works on a computer — it opens the webcam, and a card already on the clipboard can be pasted straight in.",
      },
      { text: "Add in bulk is a computer's job, and says so on a phone instead of half working." },
      { text: "The search field on a phone has its top edge back." },
      {
        text: "Tesoro has been updated stops appearing when nothing has been deployed.",
      },
      {
        admin: true,
        text: "Brand logos take a pasted image, and a typed link is drawn in the frame before it is saved.",
      },
      {
        admin: true,
        text: "Authentication and social logins have their own section under Advanced, out of DB connection.",
      },
    ],
  },
  {
    build: 223,
    at: "2026-09-29T16:53",
    changes: [
      {
        key: true,
        text: "Delete my data, in Settings → Account: your cars, your profile and your login go. Castings you added to the shared catalogue stay, with your name off them. Export a CSV first — nothing can bring it back.",
      },
      {
        key: true,
        admin: true,
        text: "A Merge button beside a casting's name in the catalogue. It finds the other copies by brand, car number, make, model and series, shows how closely each one agrees, and folds one in — or keeps it as another box.",
      },
      {
        key: true,
        text: "The app now notices when it has been deployed again and offers to refresh, so a tab left open all week stops running last week's code.",
      },
      {
        admin: true,
        text: "Metadata editor in Settings → Advanced: rename brands, makes, models and colours across the whole catalogue. Assortments, catalogue entries and brand logos are tabs of it.",
      },
      {
        text: "Duplicates in the edit window are the same casting only — same brand, make, model and number — each with a percentage match, closest first.",
      },
      { text: "A password reset can be asked for from the login page." },
      {
        text: "Paid moved out of the boxes and into Seller & payment, where it appears when payment is Partial or Pending.",
      },
      {
        text: "Picking diorama, a 2–10 pack, team transport or super rigs ticks multipack and fills in how many cars are in it.",
      },
      { text: "A photo can be added by link on a phone, not only on a computer." },
      { admin: true, text: "A box can leave its casting and stand on its own, or join another." },
      { text: "The close button sits in line with the title in every dialog." },
      {
        text: "Fixed: the filters on the catalogue stopped taking clicks once the page had been scrolled.",
      },
      { text: "Fixed: an assortment row can be removed, not only emptied." },
    ],
  },
  {
    build: 210,
    at: "2026-09-28T23:36",
    changes: [
      {
        key: true,
        text: "A brand shelf on the catalogue: round brand marks under the filters, ordered by how many castings each brand has. Pick one and the rest dim.",
      },
      {
        key: true,
        text: "Sellers is a page of its own — what you bought from whom, what it cost and what is still owed — and it is on the phone's navigation bar.",
      },
      {
        text: "Collection and Duplicates read as tables that open a row at a time, rather than a column of cards.",
      },
      {
        admin: true,
        text: "Brand logos can be uploaded as a PNG, SVG, JPG or WebP, or pointed at a link (Settings → Metadata).",
      },
      {
        text: "Prices read Rs 350 · MRP 250 (+1.4×) everywhere — over MRP in red, under in green.",
      },
      { text: "Hot Wheels was respelled Hotwheels: 27 cars and 24 catalogue entries." },
      { text: "A seller's name is a door to everything bought from them." },
    ],
  },
  {
    build: 198,
    at: "2026-09-28T16:19",
    changes: [
      {
        key: true,
        text: "A casting can come in more than one box, and Add a car asks which one yours came in rather than guessing.",
      },
      {
        admin: true,
        text: "Assortments read as a table, and a pack counts as one box by definition.",
      },
      {
        text: "The calendar is a Tesoro page now: it carries what each day cost and reads as a month when you want one.",
      },
      { text: "A pre-order is due in a month rather than on a day it was never promised on." },
      { text: "A casting says what it typically sold for, or its MRP." },
    ],
  },
  {
    build: 185,
    at: "2026-09-27T15:31",
    changes: [
      {
        key: true,
        text: "Importing a CSV became a conversation: the preview is where a bad row gets fixed, it offers the answers instead of asking you to type them, and an import can be taken back afterwards.",
      },
      {
        key: true,
        text: "Every stored ID was rewritten in the shapes the app derives — one catalogue ID per casting, one car ID per car you own.",
      },
      { text: "My Orders groups by parcel or by purchase." },
      { text: "A parcel is one parcel, and an order says which month it was." },
      {
        text: "A car can be pointed at a different casting, and says when somebody else changed it.",
      },
      {
        text: "The CSV template teaches by example and holds the fields the form asks for. A scale and a collector number survive being opened in Excel.",
      },
      {
        admin: true,
        text: "Assortments are a list somebody keeps, not whatever the cars happen to say, and the catalogue page edits more than photos.",
      },
      { text: "Fixed: the badge on Add a car goes out, and points at the right door." },
    ],
  },
  {
    build: 172,
    at: "2026-09-26T21:37",
    changes: [
      {
        key: true,
        text: "A casting sold in two boxes shows both of them, and the number on the box is what decides where one casting ends and the next begins.",
      },
      {
        text: "A catalogue entry can be told when it came out. Recently Released is the last week, dated from the first copy that actually arrived.",
      },
      { text: "A casting filed twice under different variants still clubs together." },
      { text: "Fixed: a year typed on one entry and not on the other made a second casting." },
      { text: "The import preview scrolls, and shows the IDs and the casting it will write." },
    ],
  },
  {
    build: 160,
    at: "2026-09-25T18:51",
    changes: [
      {
        key: true,
        text: "Your price and your name stay yours. What you paid is readable by you and by nobody else, whatever else the app shows.",
      },
      {
        key: true,
        text: "The home page is yours to arrange, and the catalogue's filters chain — each one narrows what the next one offers.",
      },
      {
        text: "An order launching is one notice rather than one per car, and reads as the shipment it is.",
      },
      { text: "The Late tile opens the cars that are late." },
      { text: "Search by any field, and what was searched is kept." },
      { text: "Update car can fetch its casting from the catalogue." },
      { text: "The privacy policy and the terms are readable before you sign in." },
      { text: "Arriving soon says who it is from and how long the wait is." },
      { text: "A car inside a box stops counting twice." },
    ],
  },
  {
    build: 138,
    at: "2026-09-24T21:51",
    changes: [
      {
        key: true,
        text: "Adding a purchase is seven taps: one card per casting, and the form already knows what other collectors filed.",
      },
      {
        text: "Photographs: tap the one in the identity card to pick a different one, and scrolling to the end of the strip reveals the rest.",
      },
      {
        text: "A photo you set on a car stays that car's, and replacing one no longer deletes it out from under everybody else.",
      },
      { text: "Only a car in transit is asked for a courier." },
      { text: "The catalogue is read again when you come back to the tab." },
      { text: "Arriving soon has a window of its own." },
      {
        admin: true,
        text: "Settings → Catalogue Photos, for filling in a run of them: it searches like the main box and knows the colour it is looking for.",
      },
    ],
  },
  {
    build: 114,
    at: "2026-09-23T17:56",
    changes: [
      {
        key: true,
        text: "Eleven statuses became six, and buying the same casting again collapses to one row rather than another line in the list.",
      },
      { text: "Catalogue details reads like a car's, and a quiet week says what is coming." },
      { text: "A shared car number is no longer treated as a duplicate." },
      { text: "Fixed: the add-a-car form wiped itself every few seconds." },
      {
        admin: true,
        text: "Push the catalogue into every collection from one button — and it never pushes its photos into anybody's cars.",
      },
    ],
  },
  {
    build: 105,
    at: "2026-09-21T19:19",
    changes: [
      {
        text: "A Google sign-in that does not finish says why, and the button reads Continue with Google.",
      },
      { text: "Inventory is called My Cars." },
      { text: "A car number can be corrected from car details." },
    ],
  },
  {
    build: 102,
    at: "2026-09-20T18:09",
    changes: [
      {
        key: true,
        text: "A catalogue entry can be a box of cars, and the cars inside one are hidden rather than counted twice.",
      },
      { text: "File a casting the same way you add a car, and mark a box from either." },
      { text: "The catalogue says so when it already has the casting being typed." },
      { text: "Fixed: owning one colour of a casting marked the other colours owned." },
      { admin: true, text: "A duplicate catalogue entry can be merged into the one being kept." },
    ],
  },
  {
    build: 96,
    at: "2026-09-19T22:51",
    changes: [
      {
        text: "Steadier screens: a panel that fails to load recovers instead of emptying, and who may change what is checked more carefully.",
      },
    ],
  },
  {
    build: 92,
    at: "2026-09-18T21:05",
    changes: [
      {
        key: true,
        text: "One form for every car. Adding and updating stopped being two different screens that disagreed with each other.",
      },
      { text: "One catalogue entry per casting, one Car ID per car owned." },
      { text: "A mix number is a case release, not a sub series." },
      { text: "The catalogue fits a phone, and the form keeps its place when you come back." },
    ],
  },
  {
    build: 88,
    at: "2026-09-17T10:31",
    changes: [
      { key: true, text: "Photograph a card and the form fills itself in from it." },
      { text: "The app renders on the server, so the first screen arrives already drawn." },
    ],
  },
  {
    build: 85,
    at: "2026-09-16T23:28",
    changes: [
      {
        key: true,
        text: "A shared catalogue page, and car details that take their facts from it rather than from whatever was typed.",
      },
      { text: "Pay a balance while updating a status." },
      {
        text: "Web image search, an Update order dialog, and errors shown on the field that caused them.",
      },
      { text: "A splash screen, new icons and a live search bar." },
      { text: "The iPhone home-screen icon follows light and dark mode." },
    ],
  },
  {
    build: 77,
    at: "2026-09-15T23:56",
    changes: [
      { key: true, text: "A recently pre-ordered shelf, and a spending chart on Habits." },
      { text: "Top 5 picks make, model, series or the rest with a segment control." },
      {
        text: "Phone polish: the navigation bar, the transit tracker and the gestures on car details.",
      },
      { text: "Fixed: the catalogue crashed, and the navbar shrank on the iOS bounce." },
      { admin: true, text: "A Users page, and approvals that arrive as a push notification." },
    ],
  },
  {
    build: 66,
    at: "2026-09-14T17:23",
    changes: [
      {
        text: "Layout on phones: the car details drawer, how it is dismissed, and touch handling throughout.",
      },
      { text: "Looking up a car's picture got harder to break." },
    ],
  },
  {
    build: 60,
    at: "2026-09-13T12:57",
    changes: [
      {
        key: true,
        text: "Rarity and condition on a car, a five-step add car, and deliveries in the bell.",
      },
      { text: "Adding a car searches every collection, not only your own." },
      { text: "Your rows are locked to you at the database, not only in the screens." },
    ],
  },
  {
    build: 57,
    at: "2026-09-12T14:45",
    changes: [
      {
        key: true,
        text: "Order IDs, a bottom bar on the phone, and inventory became a page rather than a panel.",
      },
      { text: "Photograph the card instead of typing it." },
      { text: "The car details card reads top to bottom." },
      { text: "One flame, one star, and a filter panel that fits." },
      { text: "The mark takes the accent colour, and changes with it." },
    ],
  },
  {
    build: 35,
    at: "2026-09-11T22:11",
    changes: [
      { key: true, text: "A dashboard about what is coming and what has arrived." },
      { text: "One parcel, one shipping ID." },
      { text: "Photographs of the actual car, rather than a link to somebody else's." },
      { text: "The account in the corner, and an account page to go with it." },
      { text: "One bell for what expires, one button for what moves." },
    ],
  },
  {
    build: 19,
    at: "2026-09-10T23:40",
    changes: [
      {
        key: true,
        text: "The beginning: a collection to add to, a CSV template one click away, and catalogue fields that are searchable dropdowns which learn as they are used.",
      },
      { text: "A shipment gets an expected date, a courier and a number." },
      { text: "An undo button, and a delivery that asks before it reconciles." },
      { text: "The car name splits into three linked dropdowns, and a report comes out as a PDF." },
      { text: "An auto theme, kept with the account rather than with the browser." },
    ],
  },
];

export const LATEST_BUILD = RELEASES[0].build;

/** Where the last build read is remembered. Per browser, not per account. */
export const SEEN_KEY = "dg.whatsNewSeen";

/**
 * The releases as this reader should see them.
 *
 * A release whose every line was about an admin screen is dropped rather than
 * shown empty: the build happened, but there is nothing in it to tell them.
 */
export function releasesFor(isAdmin: boolean): Release[] {
  if (isAdmin) return RELEASES;
  return RELEASES.map((r) => ({ ...r, changes: r.changes.filter((c) => !c.admin) })).filter(
    (r) => r.changes.length > 0,
  );
}

/** What has landed since the build last read. */
export function releasesSince(seen: number): Release[] {
  return RELEASES.filter((r) => r.build > seen);
}

/** The build last read, or 0 — a browser that has never looked has news. */
export function readSeen(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeSeen(build: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(build));
  } catch {
    // A browser that will not keep it shows the news again. No worse than that.
  }
}

/** "29 Sep 2026, 4:53 pm" in the reader's own locale. */
export function stamp(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
