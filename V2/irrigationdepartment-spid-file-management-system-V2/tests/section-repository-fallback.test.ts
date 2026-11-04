import { describe, it, expect } from 'vitest';
import { SectionRepository } from '../src/models/SectionRepository';

type QueryResult = { data: any; error: any };

function createClient(responses: QueryResult[]) {
  const queue = [...responses];
  const calls = { order: 0, ilike: 0, eq: 0 };
  const next = () => queue.shift() ?? { data: null, error: null };

  const client = {
    from: () => ({
      select: () => ({
        order: async () => {
          calls.order += 1;
          return next();
        },
        ilike: () => ({
          maybeSingle: async () => {
            calls.ilike += 1;
            return next();
          },
        }),
        eq: () => ({
          maybeSingle: async () => {
            calls.eq += 1;
            return next();
          },
        }),
      }),
    }),
  };

  return { client, calls };
}

const MISSING_COLUMN = {
  code: '42703',
  message: 'column sections.status does not exist',
};

describe('SectionRepository schema fallbacks', () => {
  it('falls back to the legacy schema when a column is missing', async () => {
    const { client, calls } = createClient([
      { data: null, error: MISSING_COLUMN },
      { data: [{ id: 2, name: 'Finance' }], error: null },
    ]);

    const rows = await new SectionRepository(client as any).listAll();

    expect(calls.order).toBe(2);
    expect(rows).toEqual([
      { id: 2, name: 'Finance', status: 'approved', section_lead: null },
    ]);
  });

  it('propagates genuine database errors instead of retrying needlessly', async () => {
    const { client, calls } = createClient([
      { data: null, error: { code: 'PGRST000', message: 'connection failed' } },
    ]);

    await expect(new SectionRepository(client as any).listAll()).rejects.toMatchObject({
      message: 'connection failed',
    });
    expect(calls.order).toBe(1);
  });

  it('only retries findById without the newer columns on schema errors', async () => {
    const fallback = createClient([
      { data: null, error: MISSING_COLUMN },
      { data: { id: 7, name: 'Legal' }, error: null },
    ]);

    await expect(new SectionRepository(fallback.client as any).findById(7)).resolves.toEqual({
      id: 7,
      name: 'Legal',
      status: 'approved',
      section_lead: null,
    });
    expect(fallback.calls.eq).toBe(2);

    const failure = createClient([
      { data: null, error: { code: 'PGRST000', message: 'connection failed' } },
    ]);
    await expect(new SectionRepository(failure.client as any).findById(9)).rejects.toMatchObject({
      message: 'connection failed',
    });
    expect(failure.calls.eq).toBe(1);
  });

  it('only retries findByName without the newer columns on schema errors', async () => {
    const fallback = createClient([
      { data: null, error: MISSING_COLUMN },
      { data: { id: 3, name: 'Finance' }, error: null },
    ]);

    await expect(
      new SectionRepository(fallback.client as any).findByName('Finance')
    ).resolves.toEqual({
      id: 3,
      name: 'Finance',
      status: 'approved',
      section_lead: null,
    });
    expect(fallback.calls.ilike).toBe(2);

    const failure = createClient([
      { data: null, error: { code: 'PGRST000', message: 'connection failed' } },
    ]);
    await expect(
      new SectionRepository(failure.client as any).findByName('Finance')
    ).rejects.toMatchObject({ message: 'connection failed' });
    expect(failure.calls.ilike).toBe(1);
  });
});
