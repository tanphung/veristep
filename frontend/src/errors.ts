const MAX_MESSAGE_LENGTH=240;

function messages(cause:unknown):string[]{
  const found:string[]=[];
  let current:unknown=cause;
  for(let depth=0;current&&depth<6;depth++){
    if(current instanceof Error&&current.message)found.push(current.message);
    else if(typeof current==="string")found.push(current);
    if(typeof current!=="object")break;
    current=(current as {cause?:unknown}).cause;
  }
  return found;
}

export function friendlyError(cause:unknown,fallback="The requested operation could not be completed"):string{
  const raw=messages(cause).join(" ");
  if(/4001|user rejected|signature rejected|request rejected/i.test(raw))return "Signature rejected. No transaction was sent.";
  if(/wallet_(?:get|request)Snaps|wallet snap|metamask/i.test(raw))return "Connect MetaMask with the GenLayer Wallet Snap, then try again.";
  if(/wrong network|switch (?:the )?wallet|chain mismatch|chain id/i.test(raw))return "The wallet is on the wrong network. Switch to the network shown in VeriStep.";
  if(/no validators found|validators timeout|leader timeout/i.test(raw))return "Validator consensus is temporarily unavailable. The existing transaction hash remains safe to check; do not resend.";
  if(/private method|method not found|invalid params|function .* not found/i.test(raw))return "This action is not supported by the selected contract deployment.";
  if(/returnData|genvm|traceback|stack trace|execution reverted|vm exception/i.test(raw))return `${fallback}. The contract rejected the operation; no frontend decision was substituted.`;
  const first=raw.split(/\r?\n/).map(item=>item.trim()).find(Boolean);
  if(!first)return fallback;
  return first.length>MAX_MESSAGE_LENGTH?`${first.slice(0,MAX_MESSAGE_LENGTH-1)}…`:first;
}
