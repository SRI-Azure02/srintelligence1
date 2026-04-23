import { NextRequest, NextResponse } from 'next/server';
import { generateStoryReport } from '@/src/lib/llm/anthropic';

interface IncomingMessage {
  role: string;
  content?: string;
  agentActivity?: { routedTo?: string };
  mTreeNarrative?: string;
  causalNarrative?: string;
  clusterNarrative?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      threadTitle: string;
      messages: IncomingMessage[];
    };

    const { threadTitle, messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Collect all agent narratives, including specialised narrative fields
    const agentResults = messages
      .filter((m) => m.role === 'agent')
      .map((m) => {
        const narrative = [
          m.content,
          m.mTreeNarrative,
          m.causalNarrative,
          m.clusterNarrative,
        ]
          .filter(Boolean)
          .join('\n\n')
          .trim();

        return {
          agentName: m.agentActivity?.routedTo ?? 'SRI Analytics Engine',
          narrative,
        };
      })
      .filter((r) => r.narrative.length > 30); // skip trivial / empty messages

    if (agentResults.length === 0) {
      return NextResponse.json(
        { error: 'No agent analysis results found to generate a report from.' },
        { status: 400 },
      );
    }

    const report = await generateStoryReport({ threadTitle, agentResults });
    return NextResponse.json({ report });
  } catch (err) {
    console.error('[StoryReport] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Report generation failed' },
      { status: 500 },
    );
  }
}
