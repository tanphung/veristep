import {describe,expect,it} from "vitest";
import {friendlyError} from "../../frontend/src/errors";

describe("safe user-facing errors",()=>{
  it("never renders raw GenVM return data",()=>{expect(friendlyError(new Error("GenVM ReturnData: Traceback secret stack"),"Read failed")).toBe("Read failed. The contract rejected the operation; no frontend decision was substituted.");});
  it("maps missing validators without suggesting a resend",()=>{expect(friendlyError(new Error("No validators found to process transaction"))).toContain("do not resend");});
  it("truncates unexpected single-line messages",()=>{expect(friendlyError(new Error("x".repeat(500)))).toHaveLength(240);});
});
