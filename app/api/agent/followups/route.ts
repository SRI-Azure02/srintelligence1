import { NextRequest, NextResponse } from 'next/server';
import { generateSmartFollowups } from '@/src/lib/llm/anthropic';

export async function POST(req: NextRequest) {
  try {
    const { userQuestions, lastAgentResponse, agentsRun } = await req.json() as {
      userQuestions:     string[];
      lastAgentResponse: string;
      agentsRun:         string[];
    };

    const followups = await generateSmartFollowups({ userQuestions, lastAgentResponse, agentsRun });
    return NextResponse.json({ followups });
  } catch (err) {
    console.error('[Followups]', err);
    return NextResponse.json({ followups: [] });
  }
}
