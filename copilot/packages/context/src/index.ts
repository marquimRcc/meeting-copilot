import { normalize, type ContextDocument, type Evidence } from '../../contracts/src/index.ts';

const stopwords = new Set(('a o as os de da do das dos em no na nos nas um uma uns umas e ou que '
  + 'como qual quais quem onde por porque para com sem sobre se eu meu minha voce voces seu sua '
  + 'isso esse essa neste nesse nessa eram era foi sao ser estar esta estavam ja ao aos').split(' '));

function terms(text: string): string[] {
  return [...new Set(normalize(text).split(' ').filter(word => word.length > 2 && !stopwords.has(word)))];
}

/** Local lexical retrieval, paragraph citations. Embeddings are a later adapter. */
export class ContextIndex {
  private documents: ContextDocument[];

  constructor(documents: readonly ContextDocument[]) {
    const ids = new Set<string>();
    this.documents = documents.map(doc => {
      if (!doc || typeof doc.id !== 'string' || !doc.id.trim() || ids.has(doc.id)
        || typeof doc.title !== 'string' || !doc.title.trim()
        || typeof doc.text !== 'string' || doc.text.length > 500000
        || !Array.isArray(doc.scopes) || doc.scopes.some(scope => typeof scope !== 'string' || !scope.trim())) {
        throw new Error('Invalid or duplicate context document');
      }
      ids.add(doc.id);
      return { ...doc, scopes: [...doc.scopes] };
    });
  }

  search(query: string, selectedScopes: readonly string[], limit = 4): Evidence[] {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('Invalid retrieval limit');
    if (!selectedScopes.length) return [];
    const queryTerms = terms(query);
    if (!queryTerms.length) return [];
    const selected = new Set(selectedScopes);
    const evidence: Evidence[] = [];
    for (const doc of this.documents) {
      if (!doc.scopes.some(scope => selected.has(scope))) continue;
      for (const [position, text] of doc.text.split(/\n\s*\n/).entries()) {
        const paragraph = text.trim();
        if (!paragraph) continue;
        // A title match alone cannot make an unrelated paragraph evidence.
        const vocabulary = new Set(terms(paragraph));
        const matches = queryTerms.filter(term => vocabulary.has(term)).length;
        if (!matches) continue;
        evidence.push({ documentId: doc.id, title: doc.title, paragraph: position + 1,
          text: paragraph.slice(0, 1800), score: matches / queryTerms.length });
      }
    }
    return evidence.sort((a, b) => b.score - a.score || a.documentId.localeCompare(b.documentId)
      || a.paragraph - b.paragraph).slice(0, limit);
  }
}
