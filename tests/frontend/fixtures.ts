import type {Job,Artifact} from '../../frontend/src/types';
import {canonical,digest} from '../../frontend/src/evidence';
export async function jobFixture():Promise<Job>{
  const job:Job={id:'test-job',chain_id:'1',contract:'0x1111111111111111111111111111111111111111',client:'0x2222222222222222222222222222222222222222',workers:{A:'0x3333333333333333333333333333333333333333',B:'0x4444444444444444444444444444444444444444'},status:'REVIEWABLE',terms_hash:'terms',accepted:{A:true,B:true},b_missing:false,created_at:100,accept_deadline:200,review_deadline:2_000_000_000,artifacts:{},claims:{},ledger:{received:'42',issued:'0',emitted:'0',credits:{CLIENT:'0',A:'0',B:'0'}},terms:{version:'veristep-1.1',title:'Test-only fixture',task:'Explain export eligibility.',verify_source:false,money:{A:{fee:'10',bond:'5',penalty:'3'},B:{fee:'20',bond:'7',penalty:'4'}},accept_seconds:60,step_seconds:60,review_seconds:60,adjudication_seconds:60}};
  for(const role of ['SOURCE','A','B'] as const){
    const content='Trial accounts cannot export. Paid export requires approval.';
    const identity={chain_id:job.chain_id,contract:job.contract,job_id:job.id,role,revision:1,issuer:role==='SOURCE'?job.client:job.workers[role],upstream:role==='SOURCE'?'':job.artifacts[role==='A'?'SOURCE':'A']!.submission_id,content_type:'text/plain',encoding:'utf-8',byte_length:new TextEncoder().encode(content).length,sha256:await digest(content)};
    job.artifacts[role]={...identity,content,submission_id:await digest(canonical(identity))} as Artifact;
  }
  job.terms_hash=await digest(canonical({terms:job.terms,source:job.artifacts.SOURCE!.submission_id,job:job.id,workers:job.workers,client:job.client,accept_deadline:job.accept_deadline}));
  return job;
}
export async function reviewedFixture():Promise<Job>{
  const job=await jobFixture();job.status='RESOLVED';job.outcomes={A:'SATISFIED',B:'SATISFIED'};job.ledger={received:'42',issued:'42',emitted:'0',credits:{CLIENT:'0',A:'15',B:'27'}};
  job.review={snapshot_sha256:'fixture-snapshot',terms_hash:job.terms_hash,reviewed_at:150,result:{reviewed_chunks:['SOURCE:1:0','A:1:0','B:1:0'],assessments:[]}};
  for(const id of ['A_MEANING','A_COVERAGE','B_FAITHFULNESS','B_COVERAGE']){
    const roles=id.startsWith('A_')?['SOURCE','A'] as const:['A','B'] as const;
    const citations=[];for(const role of roles){const artifact=job.artifacts[role]!;citations.push({chunk_id:`${role}:1:0`,quote:artifact.content,start_byte:0,end_byte:artifact.byte_length,chunk_sha256:await digest(artifact.content)});}
    job.review.result.assessments.push({obligation_id:id,status:'SATISFIED',reason:'Controlled fixture, not an actual AI verdict.',citations});
  }
  return job;
}
