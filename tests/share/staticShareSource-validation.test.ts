import { describe, expect, it } from 'vitest';
import { StaticShareDataSource } from '../../apps/share/src/data/staticShareSource';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function sourceWithSnapshot(snapshot: unknown): StaticShareDataSource {
  const manifest = {
    schemaVersion: 1,
    profiles: [{ slug: 'alice', state: 'published', snapshot: 'profiles/alice.json' }],
    media: {},
  };
  return new StaticShareDataSource({
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/index.json')) return jsonResponse(manifest);
      if (url.endsWith('/profiles/alice.json')) return jsonResponse(snapshot);
      return jsonResponse({}, 404);
    }) as typeof fetch,
  });
}

const validContent = {
  schemaVersion: 1,
  profile: { displayName: 'Alice Andrade', bio: 'Bio pública' },
  sections: [],
};

const makeSnapshot = (content: unknown) => ({ slug: 'alice', profileVersion: 1, content });

describe('StaticShareDataSource — validação canônica do fixture estático', () => {
  it('aceita um fixture que corresponde ao contrato público', async () => {
    const source = sourceWithSnapshot(makeSnapshot(validContent));
    await expect(source.getPublishedProfileBySlug('alice')).resolves.toMatchObject({
      slug: 'alice',
    });
  });

  it('rejeita fixtures com chaves internas/proibidas no conteúdo publicado', async () => {
    const tainted = {
      ...validContent,
      admin: true,
      private: 'não público',
      draft: { note: 'rascunho interno' },
    };
    const source = sourceWithSnapshot(makeSnapshot(tainted));

    await expect(source.getPublishedProfileBySlug('alice')).rejects.toThrow(
      'Snapshot público inválido',
    );
  });

  it('rejeita chaves proibidas também em níveis aninhados do fixture', async () => {
    const tainted = {
      ...validContent,
      profile: { ...validContent.profile, internalNote: 'somente interno' },
    };
    const source = sourceWithSnapshot(makeSnapshot(tainted));

    await expect(source.getPublishedProfileBySlug('alice')).rejects.toThrow(
      'Snapshot público inválido',
    );
  });
});
