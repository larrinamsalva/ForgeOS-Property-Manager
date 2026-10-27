import { describe, expect, it } from 'vitest';
import { meterTaskDestination, meterViewFromQuery, meterSiteFromQuery } from '../../src/lib/meter-actions';

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


  it('deep-links approved review tasks to the matching physical site without exposing resident details', () => {
    const target = meterTaskDestination('review', 'org X', 'prop 12', 'site & 88');
    const url = new URL(target.href, 'https://example.test');
    expect(url.pathname).toBe('/meters');
    expect(url.searchParams.get('organization')).toBe('org X');
    expect(url.searchParams.get('property')).toBe('prop 12');
    expect(url.searchParams.get('view')).toBe('review');
    expect(url.searchParams.get('site')).toBe('site & 88');
    expect(url.searchParams.has('stay')).toBe(false);
    expect(url.searchParams.has('customer')).toBe(false);
  });

  it('deep-links evidence inspections to reading history at the same physical site', () => {
    const url = new URL(meterTaskDestination('inspect','org','property','site-88').href,'https://example.test');
    expect(url.searchParams.get('view')).toBe('history');
    expect(url.searchParams.get('site')).toBe('site-88');
  });

  it('does not pass site or billing information to the separate tablet reader', () => {
    const url = new URL(meterTaskDestination('capture','org','property','site-secret').href,'https://example.test');
    expect(url.pathname).toBe('/tablet/index.html');
    expect(url.searchParams.has('property')).toBe(false);
    expect(url.searchParams.has('site')).toBe(false);
  });

  it('accepts only physical sites belonging to the authorized requested property', () => {
    const sites = [
      {id:'site-88',property_id:'park-1'},
      {id:'site-99',property_id:'park-2'},
    ];
    expect(meterSiteFromQuery('site-88','park-1',sites)).toBe('site-88');
    expect(meterSiteFromQuery('site-99','park-1',sites)).toBeUndefined();
    expect(meterSiteFromQuery('unknown','park-1',sites)).toBeUndefined();
    expect(meterSiteFromQuery(undefined,'park-1',sites)).toBeUndefined();
    expect(meterSiteFromQuery('site-88','',sites)).toBeUndefined();
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
