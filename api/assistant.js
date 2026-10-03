const emptyLead={name:"",phone:"",email:"",property:"",location:"",budget:"",dealPrice:"",deposit:"",paymentPlan:"",paymentFrequency:"",amountPaid:"",balance:"",timeline:"",nextFollowUp:"",nextAction:"",status:"New",source:"",preferredContact:"",objections:"",notes:""};

const schema={
  type:"object",
  properties:{
    action:{type:"string",enum:["create_lead","update_lead","ask_question","no_action"]},
    reply:{type:"string"},
    lead:{
      type:"object",
      properties:{
        name:{type:"string"},phone:{type:"string"},email:{type:"string"},property:{type:"string"},
        location:{type:"string"},budget:{type:"string"},dealPrice:{type:"string"},deposit:{type:"string"},
        paymentPlan:{type:"string"},paymentFrequency:{type:"string"},amountPaid:{type:"string"},balance:{type:"string"},
        timeline:{type:"string"},nextFollowUp:{type:"string"},nextAction:{type:"string"},status:{type:"string"},
        source:{type:"string"},preferredContact:{type:"string"},objections:{type:"string"},notes:{type:"string"}
      },
      required:["name","phone","email","property","location","budget","dealPrice","deposit","paymentPlan","paymentFrequency","amountPaid","balance","timeline","nextFollowUp","nextAction","status","source","preferredContact","objections","notes"]
    }
  },
  required:["action","reply","lead"]
};

function buildPrompt(text,history=[],currentLead=emptyLead){
  const prompt=[
    "You are OVAM AI, a warm and concise Nigerian real-estate CRM assistant.",
    "",
    "Your job is to listen to what an agent says about a prospect and maintain a complete running CRM record.",
    "The agent should be able to speak naturally after a call, meeting, site visit, payment discussion, or follow-up.",
    "",
    "Return ONLY one JSON object matching the supplied schema.",
    "",
    "Rules:",
    "- Treat CURRENT LEAD as the source of truth for facts already collected.",
    "- Merge new facts from the conversation into CURRENT LEAD. Never erase a known field unless the user corrects it.",
    "- Extract phone numbers exactly as spoken when clear. Preserve leading zeroes.",
    "- Never invent dates, money, contact details, payment terms, or other facts.",
    "- Capture payment details when mentioned: deal price, deposit, payment plan, payment frequency, amount paid, and balance.",
    "- Capture follow-up details when mentioned: nextFollowUp and nextAction. Keep dates/times exactly as stated if they are relative, such as \"next Friday\" or \"in two weeks\".",
    "- Capture useful context such as source, preferred contact method, objections, and important notes when mentioned.",
    "- Status may be New, Contacted, Qualified, Viewing, Negotiating, Follow-up, Won, Lost, or another sensible CRM status supported by what the user said.",
    "- Do not force the agent to provide every field.",
    "- Ask ONE short natural question only when a missing detail is important to move the lead forward.",
    "- Never ask for a field that has already been answered.",
    "- If the user gives enough information to create a useful lead, use action \"create_lead\".",
    "- If the user clearly corrects or changes an existing lead, use action \"update_lead\".",
    "- If the user is only greeting or chatting without a CRM-relevant update, use action \"no_action\".",
    "- reply is exactly what OVAM AI should say aloud. Keep it warm, natural and brief.",
    "- Return the COMPLETE merged lead on every response, not just newly mentioned fields.",
    "- Unknown fields must be empty strings.",
    "",
    "CURRENT LEAD:",
    JSON.stringify(currentLead),
    "",
    "CONVERSATION:",
    history.map(x=>x.role.toUpperCase()+": "+x.text).join("\n"),
    "",
    "LATEST USER MESSAGE:",
    text
  ].join("\n");
  return prompt;
}

function parse(raw){
  const cleaned=String(raw||"").trim().replace(/^\s*\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60\s*$/,"");
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
    const url="https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent";
    const response=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},
      body:JSON.stringify({contents:[{parts:[{text:buildPrompt(text,history,currentLead)}]}],generationConfig:{responseMimeType:"application/json",responseSchema:schema,maxOutputTokens:256}})
    });
    const rawResponse=await response.text();
    if(!response.ok) throw new Error("Gemma request failed ("+response.status+"): "+rawResponse.slice(0,300));
    const data=JSON.parse(rawResponse);
    const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!raw) throw new Error("Gemma returned no response");
    const result=parse(raw);
    return res.status(200).json({action:result.action||"no_action",reply:result.reply||"",lead:{...emptyLead,...currentLead,...(result.lead||{})}});
  }catch(error){
    return res.status(500).json({error:error.message||"Gemma assistant failed"});
  }
}