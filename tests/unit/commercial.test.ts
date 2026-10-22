import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readJson } from '../../src/lib/request-body';
import { renderMessage } from '../../src/lib/commercial-domain';
import {
  commercialCommandSchema,
  residentCommandSchema,
  reportQuerySchema,
} from '../../src/lib/commercial-validation';
import { occupancyPercent, milli } from '../../src/lib/reports-domain';
import { contentSecurityPolicy } from '../../src/lib/content-security';
import { organizationEntitlements, subscriptionReadiness } from '../../src/lib/subscription-domain';
import { canonical } from '../../src/lib/archive-format.mjs';
const context = {
  customer_name: 'River {{today}}',
  property_name: 'Pine Creek',
  site_label: 'R01',
  today: '2026-10-21',
};
const own = { membership_id: randomUUID(), request_id: randomUUID(), reason: 'Test resident request' };
function request(body: string, headers: Record<string, string> = {}) {
  return new Request('https://example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}
describe('commercial input boundaries', () => {
  it('bounds actual UTF-8 bytes even without a credible Content-Length', async () => {
    expect(await readJson(request('{"text":"é"}'), 13)).toEqual({ text: 'é' });
    await expect(readJson(request('{"text":"é"}', { 'content-length': '1' }), 12)).rejects.toMatchObject({
      status: 413,
    });
    await expect(readJson(request('{}', { 'content-length': '999' }), 12)).rejects.toMatchObject({
      status: 413,
    });
  });
  it('cancels an oversized stream and rejects malformed encoding, JSON and MIME', async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(20));
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = { headers: new Headers({ 'content-type': 'application/json' }), body: stream } as Request;
    await expect(readJson(req, 10)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
    await expect(
      readJson(
        new Request('https://example.com', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: new Uint8Array([0xff]),
        })
      )
    ).rejects.toThrow('UTF-8');
    await expect(readJson(request('{'))).rejects.toThrow();
    await expect(readJson(request('{}', { 'content-type': 'application/json-evil' }))).rejects.toMatchObject({
      status: 415,
    });
  });
  it('renders only allowed placeholders in one nonrecursive pass', () => {
    expect(renderMessage('Hello {{customer_name}} at {{property_name}}', context)).toBe(
      'Hello River {{today}} at Pine Creek'
    );
    for (const text of ['{{unknown}}', '{{today', '{{{{today}}}}', ''])
      expect(() => renderMessage(text, context)).toThrow();
  });
  it('rejects forged resident scope, contact keys and internal export commands at HTTP boundaries', () => {
    const valid = { command: 'request_contact', payload: { ...own, proposed: { phone: '555' } } };
    expect(residentCommandSchema.safeParse(valid).success).toBe(true);
    expect(
      residentCommandSchema.safeParse({
        ...valid,
        payload: { ...valid.payload, organization_id: randomUUID() },
      }).success
    ).toBe(false);
    expect(
      residentCommandSchema.safeParse({ ...valid, payload: { ...own, proposed: { notes: 'forged' } } })
        .success
    ).toBe(false);
    expect(
      commercialCommandSchema.safeParse({
        command: 'begin_export',
        payload: { organization_id: randomUUID(), request_id: randomUUID(), reason: 'Export' },
      }).success
    ).toBe(false);
  });
  it('bounds report dates, keeps integers exact and handles empty occupancy', () => {
    const q = {
      organization: randomUUID(),
      kind: 'occupancy',
      starts_on: '2026-01-01',
      ends_on: '2026-02-01',
      property_id: null,
      site_id: null,
      customer_id: null,
      employee_id: null,
      status: '',
      category: '',
      page: 0,
    };
    expect(reportQuerySchema.safeParse(q).success).toBe(true);
    expect(reportQuerySchema.safeParse({ ...q, ends_on: '2028-01-01' }).success).toBe(false);
    expect(occupancyPercent('2', '3')).toBe('66.67');
    expect(occupancyPercent('0', '0')).toBeNull();
    expect(milli('-1')).toBe('-0.001');
  });
  it('uses nonce scripts in production and limits configured connections to the URL origin', () => {
    const csp = contentSecurityPolicy('random-nonce', false, 'https://abc.supabase.co/path');
    expect(csp).toContain("'nonce-random-nonce'");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('/path');
    expect(contentSecurityPolicy('n', true)).toContain('unsafe-eval');
  });
  it('canonicalizes JSON keys and keeps SaaS billing explicitly disabled', () => {
    expect(canonical({ z: 1, a: [true, null] })).toBe('{"a":[true,null],"z":1}');
    expect(() => canonical({ x: undefined })).toThrow();
    expect(() => canonical(NaN)).toThrow();
    expect(organizationEntitlements('org')).toMatchObject({
      billingActive: false,
      planId: null,
      propertiesLimit: null,
    });
    expect(subscriptionReadiness.status).toBe('disabled');
  });
});
