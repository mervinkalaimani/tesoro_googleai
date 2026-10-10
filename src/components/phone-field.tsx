import { useEffect, useRef, useState } from "react";

import { COUNTRIES, countryOf, flagOf, formatPhone, parsePhone } from "@/lib/phone";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * A phone number as the two things it is: where it is, and the rest of it.
 *
 * One text box meant the country code was something to remember to type, and
 * a number typed without one is stored without one — which is how a ten digit
 * Indian number ends up looking like a nine digit number from somewhere else.
 * The country is picked, the digits are typed, and what goes to the database is
 * the same E.164 string as before.
 *
 * The country decides how many digits the box takes. That is a help, not a
 * wall: the limit stops a fat-fingered eleventh digit, and the hint underneath
 * says what the country expects rather than refusing to save.
 */
export function PhoneField({
  value,
  onChange,
  id,
  className,
}: {
  /** What is stored: E.164 with the plus, or anything older than this field. */
  value: string;
  onChange: (next: string) => void;
  id?: string;
  className?: string;
}) {
  /**
   * The country and the digits are state, not a reading of `value`.
   *
   * They used to be parsed back out of the stored string on every render,
   * which looks tidy and does not work: half a number is not a number anybody
   * can split. Typing 9 stored "+919", and parsePhone could not take "91" off
   * that -- one digit is not an Indian number -- so it fell back to calling
   * the whole thing the national part and the box read 919. The next keypress
   * stored "+919198", and so on: 9876543210 typed in came out as 9191919876.
   *
   * So the split is made once, from whatever arrived, and kept. `value` is
   * read again only when it changes to something this field did not send --
   * a form being reset, or a profile loading in late.
   */
  const [iso2, setIso2] = useState(() => parsePhone(value).iso2);
  const [national, setNational] = useState(() => parsePhone(value).national);
  const sent = useRef(formatPhone(iso2, national));

  useEffect(() => {
    if (value === sent.current) return;
    const parsed = parsePhone(value);
    sent.current = value;
    setIso2(parsed.iso2);
    setNational(parsed.national);
  }, [value]);

  const emit = (nextIso2: string, nextNational: string) => {
    setIso2(nextIso2);
    setNational(nextNational);
    const next = formatPhone(nextIso2, nextNational);
    sent.current = next;
    onChange(next);
  };

  const country = countryOf(iso2);
  const typed = national.length;
  // Silent while they are still typing: a number is not wrong for being
  // unfinished, so this only speaks once there is more than the country takes.
  const tooLong = typed > country.max;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-2">
        {/* Changing country keeps the digits, trimmed to what the new one
            takes -- eleven digits do not become a ten digit country's number
            by being left there. */}
        <Select
          value={iso2}
          onValueChange={(next) => emit(next, national.slice(0, countryOf(next).max))}
        >
          <SelectTrigger
            className="w-[7.5rem] shrink-0"
            aria-label={`Country: ${country.name}, +${country.dial}`}
          >
            {/* The flag and the code, not the country's name: the name is for
                choosing, the code is for reading back what was chosen. */}
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-base leading-none">
                  {flagOf(iso2)}
                </span>
                <span className="tabular-nums">+{country.dial}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.iso2} value={c.iso2}>
                <span className="flex items-center gap-2">
                  <span aria-hidden>{flagOf(c.iso2)}</span>
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={country.max}
          placeholder={"0".repeat(country.max)}
          value={national}
          onChange={(e) => emit(iso2, e.target.value.replace(/\D/g, "").slice(0, country.max))}
          className={cn("flex-1 tabular-nums", tooLong && "border-amber-500")}
        />
      </div>
      {typed > 0 && typed < country.min && (
        <p className="px-1 text-[11px] text-muted-foreground">
          {country.name} numbers are{" "}
          {country.min === country.max ? country.max : `${country.min}–${country.max}`} digits.
        </p>
      )}
    </div>
  );
}
