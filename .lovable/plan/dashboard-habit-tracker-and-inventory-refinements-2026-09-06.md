# Dashboard, habit tracker, and inventory refinements

## Dashboard

- Keep the three lower analytics panels within the first screen height and prevent page-level scrolling.
- Rename Top 10 to Top 5 and limit all ranking output to five entries.
- Place the ISO status card last in the KPI sequence.

## Habit tracker

- Make monthly and yearly matrices fit cleanly on phones without horizontal overflow.
- Render yearly periods left to right.
- Reduce insight rankings from five entries to three.
- On phones, rotate/reflow the matrix axes so the available width is filled clearly.

## Inventory

- Remove page controls and progressively reveal rows as the user scrolls inside the inventory table container.
- Keep the table header fixed and reset the visible row count when filters, search, status, or sorting changes.

## Validation

- Check desktop dashboard height and phone-width habit and inventory behavior in the running preview.
