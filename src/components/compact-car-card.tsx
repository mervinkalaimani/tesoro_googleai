import { BlisterTile, CarOverlay } from "@/components/blister-tile";

import type { Diecast } from "@/lib/types";

/**
 * The compact grid card: the photograph in the shape of the packaging, with the
 * name, brand and price laid over it on a dark fade. Every card in the app that
 * used to be a landscape photo over a text block is this one tile now (see
 * BlisterTile).
 */
export function CompactCarCard({
  car,
  onOpen,
  caption,
  synced,
  syncedSource,
  detail,
  hideStatus = false,
  className = "",
  copies = 1,
  marksOffset = false,
}: {
  /** Moves the chase / favourite marks left, clear of a button laid over the top-right corner. */
  marksOffset?: boolean;
  car: Diecast;
  onOpen: () => void;
  /**
   * One extra line under the price — "Today", "2 days ago". Optional, and
   * either every card in a given list passes one or none of them do: a caption
   * on some cards and not others is what makes a row of them ragged.
   */
  caption?: string;
  /** The catalogue entry has been checked against the maker's site. */
  synced?: boolean;
  syncedSource?: string | null;
  /**
   * The third line, in place of the assortment. A shelf where every card is
   * the same kind of thing has better uses for that line — who it is coming
   * from, on the cars that are on their way.
   */
  detail?: string;
  /**
   * Put the status on the photograph instead of beside the brand. Frees the
   * second line where the pill is the same on every card in the row, and the
   * corner of the picture is empty anyway.
   */
  statusInPhoto?: boolean;
  /**
   * No status at all. A shelf where the status is not the point — everything on
   * it landed, or everything on it is coming — spends that line on something
   * that tells one card from the next instead.
   */
  hideStatus?: boolean;
  /**
   * Sizing, from whoever is laying these out. A grid sets its own column width
   * and passes nothing; a single scrolling row passes a fixed width here rather
   * than wrapping each card in a sized div — one element carrying the width is
   * one place for it to be wrong.
   */
  className?: string;
  /**
   * How many copies of this casting the card stands for. A dense grid cell is
   * one big button, so this is a count and not a control: opening the car shows
   * every purchase, and the list and table views are where a group opens out.
   */
  copies?: number;
  copiesExpanded?: boolean;
  onToggleCopies?: () => void;
}) {
  return (
    <BlisterTile
      car={car}
      onOpen={onOpen}
      caption={caption}
      synced={synced}
      syncedSource={syncedSource}
      copies={copies}
      showStatus={!hideStatus}
      smallPills
      foot={false}
      overlay={<CarOverlay car={car} brandOnly padRight={marksOffset} detail={detail} />}
      className={className}
    />
  );
}
