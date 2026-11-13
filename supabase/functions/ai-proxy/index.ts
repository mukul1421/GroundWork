// Edge Function: ai-proxy — will be implemented in M7
// Placeholder to establish the directory structure per spec §14.1
//
// This function will:
// - Validate Supabase JWT
// - Accept BYOK API key per request (never persisted)
// - Forward to fixed OpenAI/Gemini endpoints
// - Return normalized response
// - Never log keys or raw prompt data

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve((_req: Request) => {
  return new Response(
    JSON.stringify({
      error: 'ai-proxy not yet implemented. Coming in milestone M7.',
    }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
