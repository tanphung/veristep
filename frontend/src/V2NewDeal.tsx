import {useEffect,useRef,useState,type FormEvent} from "react";
import {ArrowLeft,ArrowRight,Check,FileKey2,Scale,Users} from "lucide-react";
import type {Address} from "genlayer-js/types";
import {githubCommitment,githubOrigin} from "./v2-evidence";
import {submitV2} from "./v2-transactions";
import {friendlyError} from "./errors";
import {rawAmount} from "./V2Actions";
import {hostedWorkers} from "./client";

const steps=[{title:"Participants",icon:Users},{title:"Evidence",icon:FileKey2},{title:"Agent duties",icon:Check},{title:"Review & sign",icon:Scale}];
const evidenceOwner="tanphung",evidenceRepository="veristep-evidence";
const evidenceCommit="5502b42323eb533306dbae2c82cf0e0f25b6cd8b";
const templates=[
  {id:"refund",label:"Refund Policy",path:"templates/refund-policy.md",summary:"Refund windows, required proof and the consumed-service exception.",obligationA:"Stage A must preserve the refund window, required identifiers, non-refundable fees, and the final service-availability exception.",obligationB:"Stage B must faithfully report every refund condition from Stage A without turning eligibility into an approval guarantee."},
  {id:"export",label:"Export Rights",path:"templates/export-rights.md",summary:"Trial restrictions, approval, excluded data and preservation holds.",obligationA:"Stage A must preserve account-tier restrictions, administrator approval, export scope, exclusions, and the final preservation-hold exception.",obligationB:"Stage B must faithfully report Stage A's export conditions without omitting or weakening the final preservation-hold exception."},
  {id:"eligibility",label:"Eligibility",path:"templates/eligibility.md",summary:"Age, region, identity evidence, deadline and non-guarantee language.",obligationA:"Stage A must preserve every eligibility requirement, the review-only meaning of eligibility, and the final late-submission exception.",obligationB:"Stage B must faithfully report Stage A without presenting eligibility as guaranteed approval or dropping the deadline exception."},
] as const;

export function V2NewDeal({account,onClose,onSubmitted,onConnect,connecting=false}:{account?:Address;onClose:()=>void;onSubmitted:(id:string)=>void;onConnect?:()=>void;connecting?:boolean}){
  const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[templateId,setTemplateId]=useState<(typeof templates)[number]["id"]>("export");
  const template=templates.find(item=>item.id===templateId)??templates[1];
  const formRef=useRef<HTMLFormElement>(null);
  const [initialDealId]=useState(()=>`evidence-${crypto.randomUUID().slice(0,8)}`);
  useEffect(()=>{if(step>0)formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"] h3`)?.focus();},[step]);
  function move(next:number){const panel=formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);if(next>step&&panel){for(const field of panel.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>("input,textarea"))if(!field.reportValidity())return;}setError("");setStep(next);}
  async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!account||busy||step!==steps.length-1)return;setBusy(true);setError("");try{
    const form=new FormData(event.currentTarget),value=(name:string)=>String(form.get(name)??"").trim();
    const dealId=value("dealId"),workerA=value("workerA"),workerB=value("workerB");
    if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(dealId))throw new Error("Deal ID must use lowercase letters, numbers and hyphens");
    if(!/^0x[\da-fA-F]{40}$/.test(workerA)||!/^0x[\da-fA-F]{40}$/.test(workerB)||new Set([account.toLowerCase(),workerA.toLowerCase(),workerB.toLowerCase()]).size!==3)throw new Error("Client and both workers must be distinct valid addresses");
    const source=await githubCommitment(value("sourceOwner"),value("sourceRepo"),value("sourceCommit"),value("sourcePath"));
    const originA=await githubOrigin(value("aOwner"),value("aRepo")),originB=await githubOrigin(value("bOwner"),value("bRepo"));
    const feeA=rawAmount(value("feeA")),feeB=rawAmount(value("feeB")),bondA=rawAmount(value("bondA")),bondB=rawAmount(value("bondB")),penaltyA=rawAmount(value("penaltyA")),penaltyB=rawAmount(value("penaltyB"));
    if(penaltyA>bondA||penaltyB>bondB)throw new Error("A penalty cannot exceed its worker bond");
    const terms={workers:{A:workerA,B:workerB},origins:{SOURCE:source.origin,A:originA,B:originB},source,money:{A:{fee:String(feeA),bond:String(bondA),penalty:String(penaltyA)},B:{fee:String(feeB),bond:String(bondB),penalty:String(penaltyB)}},windows:{accept:Number(value("acceptHours"))*3600,step:Number(value("stepHours"))*3600,review:Number(value("reviewHours"))*3600,adjudication:Number(value("adjudicationHours"))*3600},max_revisions:0,semantic_obligations:[{id:"SEM_A_SCOPE_ACCURACY",stage:"A",statement:value("obligationA"),evidence_ids:["SOURCE","A"]},{id:"SEM_B_FAITHFUL_HANDOFF",stage:"B",statement:value("obligationB"),evidence_ids:["A","B"]}]};
    for(const seconds of Object.values(terms.windows))if(!Number.isInteger(seconds)||seconds<60||seconds>30*86400)throw new Error("Every window must be between one minute and 30 days");
    await submitV2(account,dealId,"create_terms",[dealId,JSON.stringify(terms)]);onSubmitted(dealId);
  }catch(cause){setError(friendlyError(cause,"Could not create v2 deal"));}finally{setBusy(false);}}
  return <section className="new-job v2-new v2-wizard">
    <div className="section-heading"><div><span className="eyebrow">NEW DEAL</span><h2>Define the work before it begins.</h2></div><button onClick={onClose} disabled={busy}>Close</button></div>
    <ol className="wizard-progress" aria-label="Deal setup steps">{steps.map((item,index)=><li className={index<step?"done":index===step?"current":""} aria-current={index===step?"step":undefined} key={item.title}><span>{index<step?<Check/>:`0${index+1}`}</span><strong>{item.title}</strong></li>)}</ol>
    {!account&&<p className="wallet-guidance">You can prepare all four steps now. Connect your wallet before signing.</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    <form ref={formRef} onSubmit={event=>void create(event)}><fieldset disabled={busy}>
      <section data-step="0" hidden={step!==0}>
        <span className="eyebrow">STEP 1 OF 4 · PARTICIPANTS</span><h3 tabIndex={-1}>Who is doing the work?</h3>
        <p>Your wallet is the client. Agent A and Agent B are prefilled with the hosted worker wallets.</p>
        <div className="form-grid participants-grid"><label>Deal ID<input name="dealId" aria-label="Deal ID" required defaultValue={initialDealId} pattern="[a-z0-9][a-z0-9-]{0,63}"/><small>A unique name to find this deal later.</small></label>
          <label>Worker A wallet<input name="workerA" aria-label="Worker A wallet" required pattern="0x[0-9a-fA-F]{40}" defaultValue={hostedWorkers.A}/><small>Reads the source and prepares the first delivery.</small></label>
          <label>Worker B wallet<input name="workerB" aria-label="Worker B wallet" required pattern="0x[0-9a-fA-F]{40}" defaultValue={hostedWorkers.B}/><small>Works from Agent A’s finalized handoff.</small></label>
        </div>
      </section>
      <section data-step="1" hidden={step!==1}>
        <span className="eyebrow">STEP 2 OF 4 · SOURCE EVIDENCE</span><h3 tabIndex={-1}>Choose one evidence template.</h3>
        <p className="template-helper">Select a card below. Your choice sets the source document and prefills the agent duties in the next step.</p>
        <div className="template-grid" role="radiogroup" aria-label="Evidence template">{templates.map((item,index)=><label className={`template-option ${item.id===templateId?"selected":""}`} key={item.id}>
          <div className="template-option-top"><span className="option-index">0{index+1}</span><input type="radio" name="template" value={item.id} checked={item.id===templateId} onChange={()=>setTemplateId(item.id)}/></div>
          <strong>{item.label}</strong><span className="option-description">{item.summary}</span><span className="option-action">{item.id===templateId?<><Check/> Selected</>:"Select template"}</span>
        </label>)}</div>
        <input type="hidden" name="sourceOwner" value={evidenceOwner}/><input type="hidden" name="sourceRepo" value={evidenceRepository}/><input type="hidden" name="sourceCommit" value={evidenceCommit}/><input type="hidden" name="sourcePath" value={template.path}/><input type="hidden" name="aOwner" value={evidenceOwner}/><input type="hidden" name="aRepo" value={evidenceRepository}/><input type="hidden" name="bOwner" value={evidenceOwner}/><input type="hidden" name="bRepo" value={evidenceRepository}/>
        <div className="source-snapshot"><FileKey2/><div><strong>{template.label} selected</strong><p>A pinned public document will be used as the source. Both agents publish evidence to the VeriStep evidence repository.</p><code>{template.path}</code></div></div>
        <details className="evidence-technical"><summary>View source and repository details</summary><dl><div><dt>Source owner</dt><dd><code>{evidenceOwner}</code></dd></div><div><dt>Source repository</dt><dd><code>{evidenceRepository}</code></dd></div><div><dt>Source commit</dt><dd><code>{evidenceCommit}</code></dd></div><div><dt>Source path</dt><dd><code>{template.path}</code></dd></div><div><dt>Agent A repository</dt><dd><code>{evidenceOwner}/{evidenceRepository}</code></dd></div><div><dt>Agent B repository</dt><dd><code>{evidenceOwner}/{evidenceRepository}</code></dd></div></dl></details>
      </section>
      <section data-step="2" hidden={step!==2}>
        <span className="eyebrow">STEP 3 OF 4 · AGENT DUTIES</span><h3 tabIndex={-1}>What must each agent deliver?</h3>
        <p>Review the prefilled duties and edit them if needed. Validators will assess the delivered work against these exact instructions.</p>
        <div key={template.id} className="obligation-fields">
          <div className="duty-field"><label htmlFor="obligation-a"><span className="duty-heading"><span className="agent-letter">A</span><strong>Stage A · Interpret the source</strong></span></label><p id="a-help">Agent A reads the source document and must preserve its material conditions.</p><textarea id="obligation-a" name="obligationA" aria-describedby="a-help" rows={5} required maxLength={900} defaultValue={template.obligationA}/></div>
          <div className="duty-field"><label htmlFor="obligation-b"><span className="duty-heading"><span className="agent-letter">B</span><strong>Stage B · Follow the handoff</strong></span></label><p id="b-help">Agent B reads A’s finalized delivery and must follow the agreed handoff duties.</p><textarea id="obligation-b" name="obligationB" aria-describedby="b-help" rows={5} required maxLength={900} defaultValue={template.obligationB}/></div>
        </div>
        <p className="field-note">These duties are frozen in the deal. Each field supports up to 900 characters.</p>
      </section>
      <section data-step="3" hidden={step!==3}>
        <span className="eyebrow">STEP 4 OF 4 · REVIEW & SIGN</span><h3 tabIndex={-1}>Review the terms before signing.</h3>
        <p>Creating this deal records the terms. You will fund the worker fees in a separate step after the transaction finalizes.</p>
        <div className="terms-group"><h4>Worker amounts <span>GEN</span></h4><div className="form-grid compact">{(["A","B"] as const).flatMap(role=>(["fee","bond","penalty"] as const).map(kind=><label key={`${role}-${kind}`}>{role} {kind} (GEN)<input name={`${kind}${role}`} required inputMode="decimal" defaultValue={kind==="fee"?"0.01":kind==="bond"?"0.005":"0.003"}/></label>))}</div><p className="field-note">Fee: payment for work. Bond: the worker’s deposit. Penalty: the maximum amount withheld from that bond.</p></div>
        <div className="terms-group"><h4>Time windows <span>HOURS</span></h4><div className="form-grid compact"><label>Accept hours<input name="acceptHours" required type="number" min="1" max="720" defaultValue="24"/></label><label>Step hours<input name="stepHours" required type="number" min="1" max="720" defaultValue="24"/></label><label>Review hours<input name="reviewHours" required type="number" min="1" max="720" defaultValue="24"/></label><label>Adjudication hours<input name="adjudicationHours" required type="number" min="1" max="720" defaultValue="24"/></label></div></div>
        <div className="freeze-note"><FileKey2/><p><strong>Review carefully.</strong> Identities, duties, amounts and deadlines become frozen contract terms. Network fees are quoted when you sign.</p></div>
        <label className="check"><input type="checkbox" required/>I verified identities, immutable evidence, duties, deadlines and settlement amounts.</label>
      </section>
      <div className="wizard-controls"><button type="button" onClick={()=>move(step-1)} disabled={step===0}><ArrowLeft/> Back</button><span>Step {step+1} of {steps.length}</span>
        {step<steps.length-1?<button key="continue" className="primary" type="button" onClick={()=>move(step+1)}>Continue <ArrowRight/></button>:account?<button key="sign" className="primary" type="submit">{busy?"Preparing transaction…":"Sign & create deal"}<ArrowRight/></button>:<button key="connect" className="primary" type="button" onClick={onConnect} disabled={!onConnect||connecting}>{connecting?"Connecting…":"Connect wallet to sign"}</button>}
      </div>
    </fieldset></form>
  </section>;
}
