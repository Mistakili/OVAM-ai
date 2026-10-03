const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

const schema={
  type:"object",
  properties:{
    action:{type:"string",enum:["create_lead","update_lead","ask_question","no_action"]},
    reply:{type:"string"},
    lead:{
      type:"object",
      properties:{
        name:{type:"string"},phone:{type:"string"},property:{type:"string"},
        location:{type:"string"},budget:{type:"string"},timeline:{type:"string"},
        status:{type:"string"},notes:{type:"string"}
      },
      required:["name","phone","property","location","budget","timeline","status","notes"]
    }
  },
  required:["action","reply","lead"]
};

function buildPrompt(text,history=[],currentLead=emptyLead){
  return \`You are OVAM AI, a warm and concise Nigerian real-estate CRM assistant.

You are a conversational real-estate assistant. Your job is to collect a prospect's details naturally and keep a running lead record.

Return ONLY one JSON object matching the supplied schema.

Rules:
- Treat CURRENT LEAD as the source of truth for facts already collected.
- Treat conversation history and the latest user message as additional context.
- Merge new facts into CURRENT LEAD. Never erase a previously collected field unless the user explicitly corrects it.
- Extract phone numbers exactly as spoken when clear. Preserve leading zeroes.
- Never invent information.
- Prioritize name, phone, property, location, budget, timeline.
- If one important field is missing, use action "ask_question" and ask ONE short natural question about the next missing field.
- Do not repeat a question that has already been answered.
- If all six priority fields are present, use action "create_lead".
- If the user clearly corrects an existing lead, use action "update_lead".
- If the user is only greeting or chatting without a CRM-relevant update, use action "no_action".
- reply is exactly what OVAM AI should say aloud. Keep it warm, natural and brief.
- Return the COMPLETE merged lead on every response, not just newly mentioned fields.
- Unknown fields must be empty strings.

CURRENT LEAD:
\${JSON.stringify(currentLead)}

CONVERSATION:
\${history.map(x=>x.role.toUpperCase()+": "+x.text).join("\\n")}

LATEST USER MESSAGE:
\${text}\`;
}

function parse(raw){
  const cleaned=String(raw||"").trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
  try{return JSON.parse(cleaned)}catch{}
  const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");
  if(start!==-1&&end>start)return JSON.parse(cleaned.slice(start,end+1));
  throw new Error("Gemma returned invalid CRM JSON.");
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const {text,history=[],currentLead=emptyLead}=req.body||{};
    if(!text?.trim()) return res.status(400).json({error:"Message is required"});
    if(!process.env.GEMINI_API_KEY) return res.status(500).json({error:"GEMINI_API_KEY is not configured"});

    const model=process.env.GEMMA_MODEL||"gemma-4-26b-a4b-it";
    const response=await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent\`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},
      body:JSON.stringify({
        contents:[{parts:[{text:buildPrompt(text,history,currentLead)}]}],
        generationConfig:{responseMimeType:"application/json",responseSchema:schema}
      })
    });
    const rawResponse=await response.text();
    if(!response.ok) throw new Error(\`Gemma request failed (\${response.status}): \${rawResponse.slice(0,300)}\`);
    const data=JSON.parse(rawResponse);
    const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!raw) throw new Error("Gemma returned no response");
    const result=parse(raw);
    return res.status(200).json({
      action:result.action||"no_action",
      reply:result.reply||"",
      lead:{...emptyLead,...currentLead,...(result.lead||{})}
    });
  }catch(error){
    return res.status(500).json({error:error.message||"Gemma assistant failed"});
  }
}
