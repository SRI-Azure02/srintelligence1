# Reports Module Implementation Checklist

## Phase 1: Infrastructure & Parsing ✅ COMPLETE

Infrastructure and document parsing pipeline completed. All core extraction and analysis utilities ready for Phase 2 semantic ingestion.

### Deliverables
- [x] **SQL Schema** — `sql/documents-setup.sql`
  - DOCUMENTS table with metadata, density analysis, ranking (BASE_WEIGHT, DECAY_LAMBDA)
  - DOCUMENT_CHUNKS table with VECTOR(768) embeddings and page tracking
  - RETRIEVAL_VALIDATIONS table for cycle-based quality tracking
  - Vector index on embeddings for cosine similarity search
  - Grants to SRI_APP_SERVICE role

- [x] **Density Analyzer** — `src/lib/documents/density-analyzer.ts`
  - Text density calculation (threshold: 0.02)
  - Routing logic: PyMuPDF (text-dense) vs. Claude Vision (sparse)
  - Confidence scores and per-page breakdown

- [x] **PDF Extractor** — `src/lib/documents/extractors/pdf-extractor.ts`
  - Uses `unpdf` library (serverless-safe)
  - PyMuPDF-equivalent text extraction for text-dense PDFs
  - Fallback to Claude Vision for sparse/image-heavy PDFs

- [x] **DOCX Extractor** — `src/lib/documents/extractors/docx-extractor.ts`
  - Uses `mammoth` library for .docx parsing
  - Extracts text and captures warnings
  - Falls back to Claude Vision for image/handwriting-heavy files

- [x] **PPTX Extractor** — `src/lib/documents/extractors/pptx-extractor.ts`
  - Uses `pptx-parse` library for slide extraction
  - Preserves slide structure and sequence
  - Handles missing shapes and empty slides gracefully

- [x] **Semantic Chunker** — `src/lib/documents/semantic-chunker.ts`
  - Claude Haiku LLM-based boundary detection (cost-optimized)
  - Identifies topic shifts, section changes, natural breaking points
  - Fallback paragraph-based chunking on API failure
  - 200-char overlap preservation for context
  - Page number estimation (2000 chars/page)

- [x] **Type Definitions** — `src/lib/documents/extractors/types.ts`
  - RawDocument, ExtractedContent, SemanticChunk
  - DocumentChunk, RetrievedChunk, ValidationResult
  - QueryRoutingResult, GeneratedResponse

- [x] **Environment Template** — `.env.example`
  - All Snowflake variables documented
  - Anthropic API key placeholder
  - Feature flags and logging configuration

- [x] **Unit Tests**
  - `density-analyzer.test.ts` — 6 test cases
  - `pdf-extractor.test.ts` — 4 test cases
  - `docx-extractor.test.ts` — 5 test cases
  - `pptx-extractor.test.ts` — 5 test cases
  - `semantic-chunker.test.ts` — 7 test cases

### Dependencies Added
```json
{
  "@anthropic-ai/sdk": "^0.20.0",
  "unpdf": "^0.1.0",
  "mammoth": "^1.6.0",
  "pptx-parse": "^1.0.0",
  "langchain": "^0.1.20",
  "langgraph": "^0.0.40",
  "vitest": "^1.0.0"
}
```

### Status: Ready for Phase 2
All Phase 1 components are production-ready. The pipeline is ready to:
1. Ingest documents (PDF/DOCX/PPTX)
2. Analyze text density and select optimal extraction method
3. Extract full text content
4. Perform semantic chunking with LLM-based boundary detection
5. Store chunks with page numbers and section labels

---

## Phase 2: Semantic Ingestion ✅ COMPLETE

### Deliverables
- [x] **Ingestion Agent** — `src/lib/documents/ingestion-agent.ts`
  - 5-stage LangGraph state machine
  - Density analysis → Text extraction → Semantic chunking → Deduplication → Embedding prep
  - Error handling at each stage with comprehensive state tracking

- [x] **Snowflake Persistence Layer** — `src/lib/documents/snowflake-persistence.ts`
  - Deduplication via SHA256 content hash
  - Embedding generation using Snowflake Cortex EMBED_TEXT_768
  - Document and chunk persistence
  - Status tracking and indexing workflow
  - Fail-open error handling (retrieval errors never block ingestion)

- [x] **Upload API Endpoint** — `app/api/documents/upload/route.ts`
  - Multipart form data handling
  - File type validation (PDF/DOCX/PPTX)
  - File size limit (50MB)
  - User ID tracking from headers
  - Returns extraction metadata and chunk count
  - CORS support

- [x] **Tests**
  - `ingestion-agent.test.ts` — 10 test cases (state creation, initialization, graph)
  - `snowflake-persistence.test.ts` — 13 test cases (duplicate check, embedding generation, persistence, error handling)

### Architecture
```
POST /api/documents/upload (multipart form data)
        ↓
LangGraph Ingestion Agent (5 stages):
  1. Analyze text density → select extraction method
  2. Extract text (PyMuPDF or Claude Vision)
  3. Semantic chunk with Claude Haiku
  4. Check for duplicates (SHA256)
  5. Prepare for embedding generation
        ↓
Snowflake Persistence:
  - Check duplicate by content hash
  - Generate embeddings (Cortex EMBED_TEXT_768)
  - Insert into DOCUMENTS table
  - Insert chunks into DOCUMENT_CHUNKS table
  - Mark document as 'indexed'
        ↓
Response: {documentId, chunksCount, status}
```

### Status: Ready for Phase 3
Documents can now be uploaded, processed, and stored with all metadata and embeddings ready for retrieval.

---

## Phase 3: Hybrid Retrieval ✅ COMPLETE

### Deliverables
- [x] **Query Router Agent** — `src/lib/documents/query-router-agent.ts`
  - Negation fixing, type conversion, keyword expansion
  
- [x] **Hybrid Search Module** — `src/lib/documents/hybrid-search.ts`
  - Vector + keyword search with Reciprocal Rank Fusion (0.6/0.4 weights)
  
- [x] **Validator Agent** — `src/lib/documents/validator-agent.ts`
  - Relevance & coverage scoring (Claude Opus)
  - Threshold: both ≥ 0.6
  
- [x] **Retrieval Orchestrator** — `src/lib/documents/retrieval-orchestrator.ts`
  - 3-cycle optimization loop with query refinement
  
- [x] **Search API Endpoint** — `app/api/documents/search/route.ts`
  - POST /api/documents/search with hybrid results
  
- [x] **Comprehensive Tests** — `src/lib/documents/retrieval-phase3.test.ts`
  - 50+ test cases covering all retrieval scenarios

---

## Phase 4: Chat Integration (2-3 days)
**Status:** Not started

### Planned Deliverables
- [ ] enrichMessage() extension for document context
- [ ] Document context injection into agent prompts
- [ ] Fail-open error handling (retrieval never blocks chat)
- [ ] Integration tests

---

## Phase 5: UI & Deployment (2-3 days)
**Status:** Not started

### Planned Deliverables
- [ ] `/app/reports/page.tsx` - Reports section page
- [ ] `src/components/reports/ReportsPanel.tsx` - Upload and document list
- [ ] Vercel deployment configuration
- [ ] UI tests

---

## Key Technical Constraints

1. **Snowflake + Anthropic Only** — No external APIs or vector stores
2. **Fail-Open Error Handling** — Retrieval errors never block chat
3. **Agentic RAG with 3-Cycle Retry** — Query re-routing and validation
4. **Semantic Chunking** — LLM-based boundary detection (not fixed-size)
5. **Citation Enforcement** — Page numbers on all responses
6. **Text Density Routing** — 0.02 threshold for extraction method selection

---

## Timeline Estimate

- **Phase 1:** ✅ Complete (completed 2026-06-22)
- **Phase 2:** 3-4 days
- **Phase 3:** 3-4 days
- **Phase 4:** 2-3 days
- **Phase 5:** 2-3 days

**Total:** 14-20 days from start → ~2026-07-12 estimated completion

---

## User Approvals Pending

- [ ] Phase 2 (Semantic Ingestion) — Ready to proceed?
- [ ] Phase 3 (Hybrid Retrieval) — Architecture sign-off?
- [ ] Phase 4 (Chat Integration) — Integration testing?
- [ ] Phase 5 (UI & Deployment) — Launch readiness?
