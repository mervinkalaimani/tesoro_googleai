/**
 * Reading a card scan out of an OpenAI-shaped reply.
 *
 * Gemini is asked for JSON with a response schema and returns exactly that.
 * The chat-completions shape OmniRoute speaks has no schema, so what comes
 * back is a string whose format the answering provider chose — bare JSON, a
 * fenced block, or a sentence. This decides which, and says nothing rather
 * than guessing.
 *
 * It lives here rather than beside the route so it can be checked without
 * loading the Gemini SDK.
 */
export function fieldsFromChatCompletion(payload: unknown): Record<string, unknown> | null {
  const choice = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string" || !content.trim()) return null;
  // Some providers fence their JSON whatever response_format asked for.
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");
  try {
    const parsed: unknown = JSON.parse(unfenced);
    // An array is JSON and is not a set of fields. Neither is null.
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
