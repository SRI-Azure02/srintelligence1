/**
 * Phase D — Multi-source synthesis prompt: 40 tests
 *
 * Groups:
 *   A. buildSynthesisSystemPrompt — pure function (10)
 *   B. buildStoryReportSystemPrompt — pure function (10)
 *   C. synthesizeNarrative — behavior via mock (10)
 *   D. generateStoryReport — behavior via mock (10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildSynthesisSystemPrompt,
  buildStoryReportSystemPrompt,
  synthesizeNarrative,
  generateStoryReport,
  type StoryReportNewsItem,
  type StoryReportDocumentChunk,
} from './anthropic';

// ── Mock setup ─────────────────────────────────────────────────────────────────
// vi.hoisted() runs before the vi.mock() factory and before imports, so the
// mockCreate reference is safe to use inside the factory (no TDZ issue).

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

function create() { return mockCreate; }

beforeEach(() => { vi.clearAllMocks(); });

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeNewsItem(overrides: Partial<StoryReportNewsItem> = {}): StoryReportNewsItem {
  return {
    title: 'Pfizer Oncology Pipeline Update',
    url: 'https://example.com/pfizer',
    source: 'Pfizer Newsroom',
    publishedAt: '2025-06-15T10:00:00Z',
    summary: 'Pfizer reported strong Phase 3 results for its oncology pipeline.',
    drugNames: ['Ibrance', 'Lorbrena'],
    weight: 0.9,
    ...overrides,
  };
}

function makeDocChunk(overrides: Partial<StoryReportDocumentChunk> = {}): StoryReportDocumentChunk {
  return {
    docName: 'oncology-market-report.pdf',
    fileType: 'pdf',
    pageNumber: 3,
    sectionLabel: 'Market Dynamics',
    chunkText: 'CDK4/6 inhibitor market share has grown significantly driven by strong NBRx performance across leading oncology brands.',
    therapyArea: 'Oncology',
    brand: 'Ibrance',
    ...overrides,
  };
}

const validStoryJson = JSON.stringify({
  title: 'Oncology Market Analysis',
  executiveSummary: 'Strong growth driven by CDK4/6 inhibitors.',
  keyFindings: ['TRx up 12% YoY'],
  sections: [{ heading: 'Market Share', body: 'Leading brands gained share.' }],
  recommendations: ['Increase HCP engagement in Q3'],
  methodology: 'Causal inference on TRx trends.',
  agentsUsed: ['SRI_CAUSAL_INFERENCE_AGENT'],
});

// ── Group A: buildSynthesisSystemPrompt (pure) ─────────────────────────────────

describe('buildSynthesisSystemPrompt', () => {
  it('A01 — includes [Rx Data] citation type', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('[Rx Data]');
  });

  it('A02 — includes [News N] citation type', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('[News N]');
  });

  it('A03 — includes [doc: filename] citation type', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('[doc: filename]');
  });

  it('A04 — includes agreement phrasing example', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('Agreement:');
    expect(prompt).toContain('confirm that');
  });

  it('A05 — includes conflict marker ⚠️', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('⚠️');
  });

  it('A06 — includes "Source conflict" phrase', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).toContain('Source conflict');
  });

  it('A07 — is non-empty without customInstructions', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('A08 — appends customInstructions when provided', () => {
    const prompt = buildSynthesisSystemPrompt('Focus only on oncology products');
    expect(prompt).toContain('Focus only on oncology products');
    expect(prompt).toContain('Additional instructions');
  });

  it('A09 — omits additional instructions section when not provided', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(prompt).not.toContain('Additional instructions');
  });

  it('A10 — returns a string', () => {
    const prompt = buildSynthesisSystemPrompt();
    expect(typeof prompt).toBe('string');
  });
});

// ── Group B: buildStoryReportSystemPrompt (pure) ──────────────────────────────

describe('buildStoryReportSystemPrompt', () => {
  it('B01 — includes [Rx Data] in guideline', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('[Rx Data]');
  });

  it('B02 — includes [News N] in guideline', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('[News N]');
  });

  it('B03 — includes [doc: filename] in guideline', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('[doc: filename]');
  });

  it('B04 — includes "Source conflict" in guideline 10', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('Source conflict');
  });

  it('B05 — includes "agree" language in guideline 10', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('confirm');
  });

  it('B06 — newsContext block present when newsItems non-empty', () => {
    const prompt = buildStoryReportSystemPrompt([makeNewsItem()], [], []);
    expect(prompt).toContain('MARKET INTELLIGENCE');
    expect(prompt).toContain('Pfizer Oncology Pipeline Update');
  });

  it('B07 — newsContext absent when newsItems empty', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).not.toContain('MARKET INTELLIGENCE');
  });

  it('B08 — documentsContext present when documentChunks non-empty', () => {
    const prompt = buildStoryReportSystemPrompt([], [makeDocChunk()], []);
    expect(prompt).toContain('INTERNAL RESEARCH DOCUMENTS');
    expect(prompt).toContain('oncology-market-report.pdf');
  });

  it('B09 — documentsContext absent when documentChunks empty', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).not.toContain('INTERNAL RESEARCH DOCUMENTS');
  });

  it('B10 — guideline 10 contains ⚠️ conflict marker', () => {
    const prompt = buildStoryReportSystemPrompt([], [], []);
    expect(prompt).toContain('⚠️');
  });
});

// ── Group C: synthesizeNarrative behavior ─────────────────────────────────────

describe('synthesizeNarrative', () => {
  it('C01 — returns text from first content block', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: '## Summary\nKey findings here.' }] });
    const result = await synthesizeNarrative({ userQuestion: 'What are the trends?', results: [] });
    expect(result).toContain('Key findings here');
  });

  it('C02 — returns empty string when response type is not text', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }] });
    const result = await synthesizeNarrative({ userQuestion: 'Q?', results: [] });
    expect(result).toBe('');
  });

  it('C03 — passes temperature 0.3 to API', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({ userQuestion: 'Q?', results: [] });
    expect(create().mock.calls[0][0].temperature).toBe(0.3);
  });

  it('C04 — passes max_tokens 2000 to API', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({ userQuestion: 'Q?', results: [] });
    expect(create().mock.calls[0][0].max_tokens).toBe(2000);
  });

  it('C05 — includes user question in user content', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({ userQuestion: 'Show me TRx trends for Ibrance', results: [] });
    const userMsg = create().mock.calls[0][0].messages[0].content as string;
    expect(userMsg).toContain('Show me TRx trends for Ibrance');
  });

  it('C06 — includes agent name in user content', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({
      userQuestion: 'Q?',
      results: [{ agentName: 'SRI_CAUSAL_INFERENCE_AGENT', narrative: 'Causal analysis result.' }],
    });
    const userMsg = create().mock.calls[0][0].messages[0].content as string;
    expect(userMsg).toContain('SRI_CAUSAL_INFERENCE_AGENT');
  });

  it('C07 — includes agent narrative in user content', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({
      userQuestion: 'Q?',
      results: [{ agentName: 'AGENT', narrative: 'Market share declined 5% QoQ.' }],
    });
    const userMsg = create().mock.calls[0][0].messages[0].content as string;
    expect(userMsg).toContain('Market share declined 5% QoQ');
  });

  it('C08 — serializes agent data as JSON in user content', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await synthesizeNarrative({
      userQuestion: 'Q?',
      results: [{ agentName: 'AGENT', data: { trx: 1200, nbrx: 340 } }],
    });
    const userMsg = create().mock.calls[0][0].messages[0].content as string;
    expect(userMsg).toContain('"trx": 1200');
  });

  it('C09 — handles empty results array', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'No data.' }] });
    const result = await synthesizeNarrative({ userQuestion: 'Q?', results: [] });
    expect(typeof result).toBe('string');
  });

  it('C10 — handles result with neither narrative nor data', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });
    await expect(
      synthesizeNarrative({ userQuestion: 'Q?', results: [{ agentName: 'AGENT' }] }),
    ).resolves.toBeDefined();
  });
});

// ── Group D: generateStoryReport behavior ─────────────────────────────────────

describe('generateStoryReport', () => {
  it('D01 — returns title from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.title).toBe('Oncology Market Analysis');
  });

  it('D02 — returns executiveSummary from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.executiveSummary).toContain('CDK4/6');
  });

  it('D03 — returns keyFindings array from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.keyFindings).toEqual(['TRx up 12% YoY']);
  });

  it('D04 — returns sections array from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.sections[0].heading).toBe('Market Share');
  });

  it('D05 — returns recommendations array from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.recommendations).toContain('Increase HCP engagement in Q3');
  });

  it('D06 — marketIntelligence equals newsItems passed in', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const news = [makeNewsItem()];
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }], newsItems: news });
    expect(report.marketIntelligence).toBe(news);
  });

  it('D07 — documentSources equals documentChunks passed in', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const docs = [makeDocChunk()];
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }], documentChunks: docs });
    expect(report.documentSources).toBe(docs);
  });

  it('D08 — methodology from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.methodology).toBe('Causal inference on TRx trends.');
  });

  it('D09 — agentsUsed from JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: validStoryJson }] });
    const report = await generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] });
    expect(report.agentsUsed).toContain('SRI_CAUSAL_INFERENCE_AGENT');
  });

  it('D10 — throws when API response is not parseable JSON', async () => {
    create().mockResolvedValueOnce({ content: [{ type: 'text', text: 'not json at all' }] });
    await expect(
      generateStoryReport({ threadTitle: 'T', agentResults: [{ agentName: 'A', narrative: 'N' }] }),
    ).rejects.toThrow('Failed to parse story report JSON');
  });
});
