const key=process.env.ASSEMBLYAI_API_KEY;
const agentId=process.env.ASSEMBLYAI_AGENT_ID;
if(!key)throw new Error("ASSEMBLYAI_API_KEY is missing");
if(!agentId)throw new Error("ASSEMBLYAI_AGENT_ID is missing");

const body={
  name:"OVAM AI",
  system_prompt:"You are OVAM AI, a warm and concise voice assistant for OVAM Realty in Nigeria. Have a natural conversation with the realtor. Keep replies short and natural. When the realtor tells you about a prospect, listen and respond helpfully. Never invent facts.",
  voice:{voice_id:"anna"},
  greeting:"Hi, I'm OVAM AI. Tell me what happened with the prospect, and I'll capture the details for you."
};

const r=await fetch("https://agents.assemblyai.com/v1/agents/"+encodeURIComponent(agentId),{method:"PUT",headers:{Authorization:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
const data=await r.json();
if(!r.ok)throw new Error(JSON.stringify(data));
console.log("OVAM AI agent updated:",data.id||agentId);
