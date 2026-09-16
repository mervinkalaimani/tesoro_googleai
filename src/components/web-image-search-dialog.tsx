import { useEffect, useState } from "react";
import { ExternalLink, Globe, ImageOff, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getSearchEngine,
  setSearchEngine,
  SEARCH_ENGINES,
  type CarImageCandidate,
  type SearchEngine,
} from "@/lib/car-image-search";

/**
 * A web image search for the car being added, in the app rather than in another
 * tab: the words start from what has been typed about the car, and tapping a
 * result uses it as the photo.
 *
 * The pictures come from a web image search run by the server. There is a link
 * to Google Images as well, for the times a picture has to be hunted for by
 * hand — a page in another tab cannot hand an image back here.
 */
export function WebImageSearchDialog({
  open,
  onOpenChange,
  initialQuery,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The car in words, from the form's own fields. */
  initialQuery: string;
  onPick: (url: string) => void;
}) {
  const [text, setText] = useState(initialQuery);
  const [engine, setEngineState] = useState<SearchEngine>(() => getSearchEngine());
  const [results, setResults] = useState<CarImageCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Each open starts from the car as it is described now.
  useEffect(() => {
    if (!open) return;
    setText(initialQuery);
    setEngineState(getSearchEngine());
    setResults([]);
    setSearched(false);
  }, [open, initialQuery]);

  const handleEngineChange = (newEngine: SearchEngine) => {
    setEngineState(newEngine);
    setSearchEngine(newEngine);
    if (text.trim()) void run(text, newEngine);
  };

  const run = async (q: string, eng = engine) => {
    const clean = q.trim();
    if (!clean) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/car-images?text=${encodeURIComponent(clean)}&engine=${encodeURIComponent(eng)}`,
      );
      const body = (await res.json()) as { candidates?: CarImageCandidate[] };
      setResults(body.candidates ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // The search the dialog was opened for runs on its own.
  useEffect(() => {
    if (open && initialQuery.trim()) void run(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Search the web for a photo</DialogTitle>
          <DialogDescription>
            Edit the words or switch providers if needed, then tap a picture to use it for this car.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 gap-1.5">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // This dialog can sit inside the car form: Enter searches.
                e.preventDefault();
                void run(text);
              }}
              placeholder="Brand, make, model, colour…"
              className="h-9"
            />
            <Button
              type="button"
              className="h-9 shrink-0 gap-1.5"
              disabled={loading || !text.trim()}
              onClick={() => void run(text)}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Search
            </Button>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Engine:</span>
            <Select value={engine} onValueChange={(v) => handleEngineChange(v as SearchEngine)}>
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_ENGINES.map((eng) => (
                  <SelectItem key={eng.value} value={eng.value} className="text-xs">
                    {eng.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[55vh] min-h-[8rem] overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Looking for photos…
            </div>
          ) : results.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {results.map((c) => (
                <button
                  key={c.url}
                  type="button"
                  onClick={() => {
                    onPick(c.url);
                    onOpenChange(false);
                  }}
                  title={c.title}
                  aria-label={`Use this photo: ${c.title}`}
                  className="aspect-square overflow-hidden rounded-md border border-border bg-muted/40 transition hover:border-primary hover:ring-2 hover:ring-primary/40"
                >
                  <img
                    src={c.thumb}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-contain"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
              <ImageOff className="size-6 text-muted-foreground/50" />
              {searched ? "Nothing came back for those words." : "Type what to look for."}
            </div>
          )}
        </div>

        <a
          href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ExternalLink className="size-3.5" />
          Open these words in Google Images
        </a>
      </DialogContent>
    </Dialog>
  );
}
