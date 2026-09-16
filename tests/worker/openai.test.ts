import {describe, expect, it} from "vitest";
import {parseOpenAIArtifact} from "../../worker/src/openai";

describe("OpenAI structured response parsing", () => {
  it("accepts exactly one structured full artifact and usage", () => {
    const parsed = parseOpenAIArtifact({output: [{type: "message", content: [{type: "output_text", text: JSON.stringify({artifact: "Complete report including its final caveat."})}]}], usage: {input_tokens: 20, output_tokens: 8}});
    expect(parsed).toEqual({artifact: "Complete report including its final caveat.", inputTokens: 20, outputTokens: 8});
  });

  it("rejects missing usage, extra keys, and missing output text", () => {
    expect(() => parseOpenAIArtifact({output: []})).toThrow("no output_text");
    expect(() => parseOpenAIArtifact({output: [{type: "message", content: [{type: "output_text", text: JSON.stringify({artifact: "x", verdict: "pay"})}]}], usage: {input_tokens: 1, output_tokens: 1}})).toThrow("schema");
    expect(() => parseOpenAIArtifact({output: [{type: "message", content: [{type: "output_text", text: JSON.stringify({artifact: "x"})}]}]})).toThrow("usage");
  });
});
