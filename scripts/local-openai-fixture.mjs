import {createServer} from "node:http";
import {createHash} from "node:crypto";

const port=Number(process.env.TASKTRACE_FIXTURE_PORT??18080);
const requests=[];
const json=(response,status,value)=>{const body=JSON.stringify(value);response.writeHead(status,{"content-type":"application/json","content-length":Buffer.byteLength(body)});response.end(body);};

function review(prompt){
  if(prompt.includes("TASKTRACE_V2_GROUNDING"))return {supported:true};
  const start=prompt.indexOf("BEGIN_UNTRUSTED_INPUT_JSON\n"),end=prompt.indexOf("\nEND_UNTRUSTED_INPUT_JSON",start);
  if(start<0||end<0)return "ok";
  const input=JSON.parse(prompt.slice(start+"BEGIN_UNTRUSTED_INPUT_JSON\n".length,end));
  const artifacts=new Map(input.artifacts.map(item=>[item.id,item]));
  return {
    reviewed_artifacts:input.artifacts.map(item=>({id:item.id,sha256:item.sha256,byte_length:item.byte_length})),
    assessments:input.obligations.map(obligation=>({
      obligation_id:obligation.id,
      status:"SATISFIED",
      reason:`The complete ${obligation.evidence_ids.join(" and ")} artifacts preserve the frozen duty without a contradictory exception.`,
      citations:obligation.evidence_ids.map(id=>{const artifact=artifacts.get(id);return {artifact_id:id,sha256:artifact.sha256,quote:artifact.content};}),
      missing_evidence_ids:[],
    })),
  };
}

const server=createServer((request,response)=>{
  if(request.method==="GET"&&request.url==="/health"){json(response,200,{ok:true,requests:requests.length});return;}
  if(request.method!=="POST"){json(response,404,{error:"not found"});return;}
  let raw="";request.setEncoding("utf8");request.on("data",chunk=>{raw+=chunk;});request.on("end",()=>{
    try{
      const body=JSON.parse(raw),messages=Array.isArray(body.messages)?body.messages:[];
      const prompt=messages.map(item=>typeof item?.content==="string"?item.content:"").join("\n");
      const result=review(prompt),content=typeof result==="string"?result:JSON.stringify(result);
      requests.push({at:new Date().toISOString(),path:request.url,model:body.model,prompt_sha256:createHash("sha256").update(prompt).digest("hex")});
      json(response,200,{id:`tasktrace-${requests.length}`,object:"chat.completion",created:Math.floor(Date.now()/1000),model:body.model??"tasktrace-fixture",choices:[{index:0,message:{role:"assistant",content},finish_reason:"stop"}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
    }catch(error){json(response,400,{error:{message:error instanceof Error?error.message:"invalid request",type:"invalid_request_error"}});}
  });
});
server.listen(port,"0.0.0.0",()=>console.log(JSON.stringify({ready:true,port})));
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(()=>process.exit(0)));
