import type { ContextDocument, EvidenceMatch } from './types.ts';
import { stemmedTokensPt, tokenizePt, stemPt } from './stemmer-pt.ts';

interface IndexedPassage {
  documentId: string;
  title: string;
  scopes: string[];
  paragraph: number;
  text: string;
  tokens: string[];
  stems: string[];
  stemFrequencies: Map<string, number>;
  length: number;
}

/**
 * Índice invertido com ranking BM25 (Okapi BM25) para recuperação precisa de contexto.
 */
export class BM25Index {
  private passages: IndexedPassage[] = [];
  private documentFrequencies = new Map<string, number>();
  private avgPassageLength = 0;
  private k1 = 1.2;
  private b = 0.75;

  constructor(documents: readonly ContextDocument[]) {
    this.indexDocuments(documents);
  }

  private indexDocuments(documents: readonly ContextDocument[]): void {
    const passages: IndexedPassage[] = [];
    const docFreq = new Map<string, number>();
    let totalTokens = 0;

    for (const doc of documents) {
      if (!doc || !doc.id || !doc.text) continue;
      const chunks = this.chunkDocument(doc.text);

      chunks.forEach((chunkText, idx) => {
        const tokens = tokenizePt(chunkText);
        if (tokens.length === 0) return;

        const stems = tokens.map(t => stemPt(t));
        const freqMap = new Map<string, number>();
        const uniqueStems = new Set<string>();

        for (const stem of stems) {
          freqMap.set(stem, (freqMap.get(stem) || 0) + 1);
          uniqueStems.add(stem);
        }

        for (const stem of uniqueStems) {
          docFreq.set(stem, (docFreq.get(stem) || 0) + 1);
        }

        totalTokens += tokens.length;
        passages.push({
          documentId: doc.id,
          title: doc.title || doc.id,
          scopes: [...doc.scopes],
          paragraph: idx + 1,
          text: chunkText,
          tokens,
          stems,
          stemFrequencies: freqMap,
          length: tokens.length
        });
      });
    }

    this.passages = passages;
    this.documentFrequencies = docFreq;
    this.avgPassageLength = passages.length > 0 ? totalTokens / passages.length : 1;
  }

  /**
   * Divide o documento em trechos semanticamente coesos (respeitando cabeçalhos e parágrafos).
   */
  private chunkDocument(text: string): string[] {
    const rawParagraphs = text.split(/\n{2,}/);
    const result: string[] = [];

    for (const p of rawParagraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      // Se o parágrafo for muito grande (> 1500 chars), divide em linhas
      if (trimmed.length > 1500) {
        const lines = trimmed.split('\n');
        let currentChunk = '';

        for (const line of lines) {
          if ((currentChunk + '\n' + line).length > 1200) {
            if (currentChunk.trim()) result.push(currentChunk.trim());
            currentChunk = line;
          } else {
            currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
          }
        }
        if (currentChunk.trim()) result.push(currentChunk.trim());
      } else {
        result.push(trimmed);
      }
    }

    return result;
  }

  /**
   * Realiza busca BM25 filtrando pelos escopos selecionados.
   */
  search(query: string, selectedScopes: readonly string[], limit = 4): EvidenceMatch[] {
    if (!query || !query.trim()) return [];
    const queryStems = stemmedTokensPt(query);
    if (queryStems.length === 0) return [];

    const isScopeWildcard = selectedScopes.includes('*') || selectedScopes.includes('todos') || selectedScopes.length === 0;
    const scopesSet = new Set(selectedScopes);

    const scoredMatches: { passage: IndexedPassage; score: number }[] = [];
    const N = this.passages.length;

    for (const passage of this.passages) {
      // Filtro de escopo
      if (!isScopeWildcard) {
        const hasScope = passage.scopes.some(scope => scopesSet.has(scope));
        if (!hasScope) continue;
      }

      let score = 0;

      for (const qStem of queryStems) {
        const tf = passage.stemFrequencies.get(qStem) || 0;
        if (tf === 0) continue;

        const df = this.documentFrequencies.get(qStem) || 0;
        // IDF com suavização padrão BM25
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

        // Term frequency com saturação BM25
        const num = tf * (this.k1 + 1);
        const denom = tf + this.k1 * (1 - this.b + this.b * (passage.length / this.avgPassageLength));

        score += idf * (num / denom);
      }

      if (score > 0) {
        scoredMatches.push({ passage, score });
      }
    }

    // Ordena por score decrescente
    scoredMatches.sort((a, b) => b.score - a.score);

    const maxScore = scoredMatches[0]?.score || 1;

    return scoredMatches.slice(0, limit).map(({ passage, score }) => ({
      documentId: passage.documentId,
      title: passage.title,
      paragraph: passage.paragraph,
      text: passage.text.slice(0, 1800),
      score: Math.min(1, Math.round((score / maxScore) * 100) / 100)
    }));
  }
}
