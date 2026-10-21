'use client';
import { useState, type FormEvent } from 'react';
import { dollarsToCents, type RatePlan } from '@/lib/billing-domain';
import { useHydrated } from '@/lib/use-hydrated';
export function UtilityRateForm({
  today,
  rates,
  onSave,
  onCancel,
}: {
  today: string;
  rates: RatePlan[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const hydrated = useHydrated();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [utility, setUtility] = useState('electric');
  const [included, setIncluded] = useState(false);
  const [conversions, setConversions] = useState([{ id: 'first', unit: 'kWh', factor: '1' }]);
  const [tiers, setTiers] = useState([{ id: 'first', up_to: '', unit_price: '' }]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '');
    setPending(true);
    setError('');
    try {
      await onSave({
        utility,
        label: value('label'),
        starts_on: value('starts_on'),
        ends_on: value('ends_on') || null,
        replaces_id: value('replaces_id') || null,
        billed_unit: value('billed_unit'),
        conversions: conversions.map(({ unit, factor }) => ({ unit: unit.trim(), factor })),
        tiers: tiers.map(({ up_to, unit_price }) => ({
          up_to: up_to || null,
          unit_price: included ? '0' : unit_price,
        })),
        monthly_base_cents: included ? '0' : dollarsToCents(value('base')),
        sewer_unit_price: included || utility !== 'water' ? '0' : value('sewer_price'),
        sewer_base_cents: included || utility !== 'water' ? '0' : dollarsToCents(value('sewer_base')),
        tax_bps: included ? 0 : Number(dollarsToCents(value('tax_percent'))),
        tax_label: value('tax_label'),
        authorization_reference: value('authorization_reference'),
        included_in_rent: included,
        reason: value('reason'),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rate could not be saved.');
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <p>
        Use the property’s authorized schedule. Prices accept up to six decimal places. Tiers apply once per
        invoice and rate version across all assigned meters.
      </p>
      <fieldset disabled={pending || !hydrated} className="billing-rate-fields">
        <div className="form-grid">
          <label className="field">
            Schedule name
            <input name="label" required maxLength={100} />
          </label>
          <label className="field">
            Utility
            <select name="utility" value={utility} onChange={(e) => setUtility(e.target.value)}>
              <option value="electric">Electric</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </label>
          <label className="field">
            Effective from
            <input type="date" name="starts_on" required defaultValue={today} />
          </label>
          <label className="field">
            Effective until (exclusive, optional)
            <input type="date" name="ends_on" />
          </label>
          <label className="field wide">
            Replace existing schedule
            <select name="replaces_id" defaultValue="">
              <option value="">New schedule; no replacement</option>
              {rates
                .filter((r) => r.utility === utility && r.status === 'active')
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.label} · {r.starts_on} → {r.ends_on || 'open'}
                  </option>
                ))}
            </select>
            <small>
              A new version closes the selected schedule on the new effective date. Approved historical
              charges stay protected.
            </small>
          </label>
          <label className="field">
            Billed unit
            <input name="billed_unit" required maxLength={30} placeholder="kWh, gallons, therms…" />
          </label>
          <label className="field check-field">
            <input type="checkbox" checked={included} onChange={(e) => setIncluded(e.target.checked)} />
            Included in rent (all charges zero)
          </label>
        </div>
        <h3>Register unit conversions</h3>
        <p className="muted">
          Enter each meter’s unit exactly and its factor to the billed unit. Use 1 for the same unit.
        </p>
        {conversions.map((row, index) => (
          <div className="billing-form-row" key={row.id}>
            <label className="field">
              Register unit {index + 1}
              <input
                required
                maxLength={30}
                value={row.unit}
                onChange={(e) =>
                  setConversions((rows) =>
                    rows.map((r) => (r.id === row.id ? { ...r, unit: e.target.value } : r))
                  )
                }
              />
            </label>
            <label className="field">
              Conversion factor {index + 1}
              <input
                required
                inputMode="decimal"
                value={row.factor}
                onChange={(e) =>
                  setConversions((rows) =>
                    rows.map((r) => (r.id === row.id ? { ...r, factor: e.target.value } : r))
                  )
                }
              />
            </label>
            <button
              type="button"
              className="button secondary small"
              disabled={conversions.length === 1}
              onClick={() => setConversions((rows) => rows.filter((r) => r.id !== row.id))}
              aria-label={`Remove conversion ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={conversions.length >= 12}
          onClick={() =>
            setConversions((rows) => [...rows, { id: crypto.randomUUID(), unit: '', factor: '1' }])
          }
        >
          Add conversion
        </button>
        <h3>Usage tiers</h3>
        <p className="muted">
          Cumulative limits in the billed unit. Leave only the last limit empty for unlimited usage.
        </p>
        {tiers.map((row, index) => (
          <div className="billing-form-row" key={row.id}>
            <label className="field">
              Tier {index + 1} cumulative limit
              <input
                inputMode="decimal"
                placeholder="Unlimited"
                value={row.up_to}
                onChange={(e) =>
                  setTiers((rows) => rows.map((r) => (r.id === row.id ? { ...r, up_to: e.target.value } : r)))
                }
              />
            </label>
            <label className="field">
              Tier {index + 1} price ($ per unit)
              <input
                required
                disabled={included}
                inputMode="decimal"
                value={included ? '0' : row.unit_price}
                onChange={(e) =>
                  setTiers((rows) =>
                    rows.map((r) => (r.id === row.id ? { ...r, unit_price: e.target.value } : r))
                  )
                }
              />
            </label>
            <button
              type="button"
              className="button secondary small"
              disabled={tiers.length === 1}
              onClick={() => setTiers((rows) => rows.filter((r) => r.id !== row.id))}
              aria-label={`Remove tier ${index + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={tiers.length >= 12}
          onClick={() =>
            setTiers((rows) => [...rows, { id: crypto.randomUUID(), up_to: '', unit_price: '' }])
          }
        >
          Add tier
        </button>
        <div className="form-grid billing-extra-fields">
          <label className="field">
            Monthly base service ($)
            <input name="base" required disabled={included} defaultValue="0.00" inputMode="decimal" />
          </label>
          <label className="field">
            Authorized tax (%)
            <input name="tax_percent" required disabled={included} defaultValue="0" inputMode="decimal" />
            <small>Enter zero explicitly when no tax applies.</small>
          </label>
          <label className="field">
            Sewer price ($ per billed water unit)
            <input
              name="sewer_price"
              required
              disabled={included || utility !== 'water'}
              defaultValue="0"
              inputMode="decimal"
            />
          </label>
          <label className="field">
            Monthly sewer base ($)
            <input
              name="sewer_base"
              required
              disabled={included || utility !== 'water'}
              defaultValue="0.00"
              inputMode="decimal"
            />
          </label>
          <label className="field">
            Tax label
            <input name="tax_label" maxLength={100} />
          </label>
          <label className="field">
            Tax authorization reference
            <input name="authorization_reference" maxLength={500} />
          </label>
          <label className="field wide">
            Rate authorization and reason
            <textarea name="reason" required minLength={3} maxLength={2000} />
          </label>
        </div>
      </fieldset>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={pending || !hydrated}>
          {pending ? 'Saving…' : 'Save rate version'}
        </button>
      </div>
    </form>
  );
}
