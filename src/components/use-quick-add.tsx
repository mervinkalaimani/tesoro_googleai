import { useMemo, useState } from "react";

import { CarFormDialog } from "@/components/car-form-dialog";
import { QuickAddDialog } from "@/components/quick-add-dialog";
import { catalogCarToCatalogueCar, type CatalogCar } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-store";
import { groupCastings } from "@/lib/casting-group";

const isPreOrder = (c: CatalogCar) => c.release_status === "Pre Order";

/**
 * The short add form for a casting, wherever a "+" sits over a card. A multi-pack goes
 * straight to the full form, which is the one that can say what is in the box.
 * `start(entry)` opens it; render `node` once beside the cards.
 */
export function useQuickAdd() {
  const { catalog } = useCatalog();
  const [quick, setQuick] = useState<CatalogCar | null>(null);
  const [full, setFull] = useState<CatalogCar | null>(null);

  // Every box this casting comes in, so the short form can offer the choice.
  const boxes = useMemo(
    () =>
      quick
        ? (groupCastings(catalog).find((g) => g.members.some((m) => m.car_id === quick.car_id))
            ?.members ?? [quick])
        : [],
    [catalog, quick],
  );

  const start = (c: CatalogCar) => (c.is_multipack ? setFull(c) : setQuick(c));

  const node = (
    <>
      <QuickAddDialog
        entry={quick}
        alternatives={boxes}
        preOrder={quick ? isPreOrder(quick) : false}
        onClose={() => setQuick(null)}
        onMore={(entry) => {
          setQuick(null);
          setFull(entry);
        }}
      />
      <CarFormDialog
        open={full !== null}
        onOpenChange={(v) => !v && setFull(null)}
        mode="add"
        prefill={full ? catalogCarToCatalogueCar(full) : null}
        prefillStatus={full && isPreOrder(full) ? "PO" : ""}
      />
    </>
  );
  return { start, node };
}
