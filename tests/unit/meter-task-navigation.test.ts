import { describe, expect, it } from 'vitest';
import { meterTaskDestination, meterViewFromQuery } from '../../src/lib/meter-actions';

describe('monthly billing meter task handoff', () => {
  it('takes capture tasks to the existing tablet reader without exposing property billing or tenant details', () => {
    const target = meterTaskDestination('capture', 'org & 1', 'private-property');
    expect(target.label).toBe('Open tablet reader');
    const url = new URL(target.href, 'https://example.test');
    expect(url.pathname).toBe('/tablet/index.html');
    expect(url.searchParams.get('organization')).toBe('org & 1');
    expect(url.searchParams.has('property')).toBe(false);
    expect(target.href).not.toContain('private-property');
  });

  it('opens supervisor review for approvals in the chosen property', () => {
    const target = meterTaskDestination('review', 'org-1', 'prop 12');
    const url = new URL(target.href, 'https://example.test');
    expect(url.pathname).toBe('/meters');
    expect(url.searchParams.get('organization')).toBe('org-1');
    expect(url.searchParams.get('property')).toBe('prop 12');
    expect(url.searchParams.get('view')).toBe('review');
    expect(target.label).toBe('Open supervisor review');
  });

  it('opens reading history for other evidence issues', () => {
    const target = meterTaskDestination('inspect', 'org-1', 'prop-1');
    const url = new URL(target.href, 'https://example.test');
    expect(url.searchParams.get('view')).toBe('history');
    expect(target.label).toBe('Open reading history');
  });

  it('accepts only known meter views from route query parameters', () => {
    for (const view of ['directory', 'routes', 'review', 'history']) {
      expect(meterViewFromQuery(view)).toBe(view);
    }
    expect(meterViewFromQuery(undefined)).toBeUndefined();
    expect(meterViewFromQuery('payments')).toBeUndefined();
    expect(meterViewFromQuery('review?property=other')).toBeUndefined();
  });
});
