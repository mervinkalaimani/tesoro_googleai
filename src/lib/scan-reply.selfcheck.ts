/**
 * Reading a scan out of an OpenAI-shaped reply.
 *
 * Gemini is asked for JSON with a response schema and gives it. The chat
 * shape has no schema, so whatever comes back is a string a provider chose
 * the format of — fenced, bare, or not JSON at all — and this is the only
 * place that decides which. A wrong answer here is a scan that silently
 * fills nothing, so it gets a check.
 */
import { fieldsFromChatCompletion } from "@/lib/scan-reply";

let failed = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) return;
  failed++;
  console.error(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
};

const reply = (content: unknown) => ({ choices: [{ message: { content } }] });

check("plain JSON", fieldsFromChatCompletion(reply('{"make":"Nissan"}')), { make: "Nissan" });

// Providers fence their JSON whatever response_format asked for.
check("fenced JSON", fieldsFromChatCompletion(reply('```json\n{"make":"Nissan"}\n```')), {
  make: "Nissan",
});
check("fenced, no language", fieldsFromChatCompletion(reply('```\n{"make":"Mazda"}\n```')), {
  make: "Mazda",
});

// Everything that is not an object of fields is nothing, not a bad guess.
check("prose, not JSON", fieldsFromChatCompletion(reply("I think it is a Skyline.")), null);
check("a JSON array", fieldsFromChatCompletion(reply('["Nissan"]')), null);
check("JSON null", fieldsFromChatCompletion(reply("null")), null);
check("empty content", fieldsFromChatCompletion(reply("   ")), null);
check("no content at all", fieldsFromChatCompletion(reply(undefined)), null);
check("no choices", fieldsFromChatCompletion({}), null);
check("not a reply", fieldsFromChatCompletion(null), null);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log("scan-reply: 10 checks pass");
