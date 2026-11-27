import { useEffect } from "react";

/**
 * Marks the page while a dialog or sheet is open, so the CSS can stop blurring everything
 * behind it.
 *
 * Every glass card on a page is its own blurred layer, and a long list has hundreds — the
 * Duplicates page had 506 with a car sheet open over it, plus 44 inside the sheet. A phone's
 * GPU cannot hold that many: the sheet came up half drawn (panels empty, the photo cut short)
 * on a Galaxy S24 Ultra in both Chrome and Samsung Internet. The page behind a sheet is under
 * a dark scrim and cannot be seen blurred anyway.
 */
export function ModalGlassGuard() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const open = !!document.querySelector('[role="dialog"][data-state="open"]');
      if (open) root.dataset.modal = "1";
      else delete root.dataset.modal;
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    return () => {
      mo.disconnect();
      delete root.dataset.modal;
    };
  }, []);
  return null;
}
