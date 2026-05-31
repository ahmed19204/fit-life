/**
 * Shared CORS headers for all FitLife Edge Functions.
 * Applied to every response (including OPTIONS preflight).
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Standard JSON success response */
export function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Standard JSON error response */
export function jsonError(
  status: number,
  message: string,
  code?: string,
): Response {
  return new Response(
    JSON.stringify({ success: false, message, code: code || "ERROR" }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** Handle OPTIONS preflight */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
