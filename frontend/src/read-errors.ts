// Read-only recovery policy. Never use this to retry a signed transaction.
export type ReadErrorKind="rate-limit"|"transient"|"protocol"|"rejected"|"unknown";
export function readErrorInfo(cause:unknown):{kind:ReadErrorKind;code?:number}{
  const codes:number[]=[],messages:string[]=[];
  const seen=new Set<unknown>();
  for(let current:unknown=cause;current&&!seen.has(current);){
    seen.add(current);
    if(typeof current==="string"){messages.push(current);break;}
    if(typeof current!=="object"||seen.size>8)break;
    const error=current as {code?:unknown;status?:unknown;message?:unknown;details?:unknown;cause?:unknown};
    if(typeof error.code==="number")codes.push(error.code);
    if(typeof error.status==="number")codes.push(error.status);
    for(const value of [error.message,error.details])if(typeof value==="string")messages.push(value);
    current=error.cause;
  }
  const message=messages.join(" "),code=codes.at(-1);
  // Deterministic failures must not be hidden by a generic outer RPC wrapper.
  if(codes.some(value=>[-32600,-32601,-32602,4001].includes(value))||/domain mismatch|manifest mismatch|report identity|invalid v2|incomplete v2|missing citation|duplicate frozen|settlement receipt identity|execution reverted|contract rejected|FINISHED_WITH_ERROR|user rejected/i.test(message))return {kind:"rejected",code};
  if(codes.some(value=>value===429||value===-32005)||/rate.?limit|too many requests|\b429\b/i.test(message))return {kind:"rate-limit",code};
  if(codes.includes(-32006)||/version of JSON-RPC protocol is not supported/i.test(message))return {kind:"protocol",code};
  if(codes.some(value=>[-32603,408,500,502,503,504].includes(value))||/unknown rpc|failed to fetch|network(?: error)?|fetch failed|timeout|timed out|gateway|\b(?:500|502|503|504)\b/i.test(message))return {kind:"transient",code};
  return {kind:"unknown",code};
}

export function reportReadFailure(operation:"get_terms"|"list_deals",cause:unknown){
  const {kind,code}=readErrorInfo(cause);
  // No raw response, calldata, wallet address, error message, or credentials.
  console.warn("[VeriStep read]",{operation,kind,code,at:new Date().toISOString()});
}
