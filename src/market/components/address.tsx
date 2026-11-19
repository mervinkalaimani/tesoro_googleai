import { useState } from "react";

import type { Address } from "../types";
import { Field, inputCls } from "./bits";

export type AddressDraft = Omit<Address, "id">;
export const BLANK_ADDRESS: AddressDraft = {
  name: "",
  phone: "",
  line1: "",
  city: "",
  state: "",
  pincode: "",
};

export function AddressForm({
  value,
  onChange,
}: {
  value: AddressDraft;
  onChange: (a: AddressDraft) => void;
}) {
  const [touched, setTouched] = useState(false);
  const set = (k: keyof AddressDraft, v: string) => onChange({ ...value, [k]: v });
  const bad = (cond: boolean) => (touched && cond ? "border-red-500" : "");
  return (
    <div className="grid gap-3 sm:grid-cols-2" onBlur={() => setTouched(true)}>
      <Field label="Full name">
        <input
          autoComplete="name"
          className={`${inputCls} ${bad(!value.name.trim())}`}
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <Field label="Phone" hint="10 digits">
        <input
          autoComplete="tel"
          inputMode="numeric"
          maxLength={10}
          className={`${inputCls} ${bad(!/^\d{10}$/.test(value.phone))}`}
          value={value.phone}
          onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <input
          autoComplete="address-line1"
          className={`${inputCls} ${bad(!value.line1.trim())}`}
          value={value.line1}
          onChange={(e) => set("line1", e.target.value)}
        />
      </Field>
      <Field label="City">
        <input
          autoComplete="address-level2"
          className={`${inputCls} ${bad(!value.city.trim())}`}
          value={value.city}
          onChange={(e) => set("city", e.target.value)}
        />
      </Field>
      <Field label="State">
        <input
          autoComplete="address-level1"
          className={`${inputCls} ${bad(!value.state.trim())}`}
          value={value.state}
          onChange={(e) => set("state", e.target.value)}
        />
      </Field>
      <Field label="Pincode" hint="6 digits">
        <input
          autoComplete="postal-code"
          inputMode="numeric"
          maxLength={6}
          className={`${inputCls} ${bad(!/^\d{6}$/.test(value.pincode))}`}
          value={value.pincode}
          onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
        />
      </Field>
    </div>
  );
}
