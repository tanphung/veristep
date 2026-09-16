import {readJob} from './client';
import {verifiedPayment} from './payment';

type Context={registerTool(tool:{name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown},options:{signal:AbortSignal}):void|Promise<void>};
export function registerWorkTools(context:Context|undefined,openCreation:()=>void):()=>void {
  if(!context?.registerTool)return()=>{};
  const lifecycle=new AbortController();
  const report=()=>console.warn('VeriStep structured browser tools are unavailable; the normal interface still works.');
  const tools=[{
    name:'read_work_record',title:'Read finalized work record',
    description:'Read a VeriStep job after artifact and review-integrity checks. Payment verification is true only for the exact committed Bradbury finalization receipt and recipient balance delta. No signing or transaction.',
    inputSchema:{type:'object',properties:{jobId:{type:'string',pattern:'^[a-z0-9][a-z0-9-]{2,63}$'}},required:['jobId'],additionalProperties:false},
    annotations:{readOnlyHint:true,untrustedContentHint:true},
    async execute(input:unknown){
      if(!input||typeof input!=='object'||Object.keys(input).join(',')!=='jobId'||!('jobId' in input)||typeof input.jobId!=='string'||!(/^[a-z0-9][a-z0-9-]{2,63}$/).test(input.jobId))throw new Error('Provide exactly one valid jobId.');
      const job=await readJob(input.jobId);
      return {jobId:job.id,status:job.status,task:job.terms.task,verifySource:job.terms.verify_source,artifacts:job.artifacts,outcomes:job.outcomes??null,review:job.review??null,credits:job.ledger.credits,recipientPaymentVerified:Boolean(verifiedPayment(job,'A'))};
    },
  },{
    name:'start_job_creation',title:'Open new-job form',
    description:'Open the visible new-job form only. Does not create a job, connect a wallet, submit evidence or transfer funds. The user must review terms and sign separately.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input:unknown){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object.');openCreation();return{stage:'FORM_OPEN',transactionSubmitted:false};},
  }];
  for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(report);}catch{report();}}
  return()=>lifecycle.abort();
}
export function pageContext():Context|undefined {return (document as Document&{modelContext?:Context}).modelContext;}
