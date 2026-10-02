const schema={action:"create_lead",lead:{name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""}};

function buildPrompt(text){
  return `You are OVAM AI, an assistant for a Nigerian real-estate business.
Your job is to understand a natural update about a prospect and decide the CRM action.

Return ONLY valid JSON with exactly this shape:
{
  "action": "create_lead" | "update_lead" | "no_action",
  "lead": {
    "name": "",
    "phone": "",
    "property": "",
    "location": "",
    "budget": "",
    "timeline": "",
    "status": "New",
    "notes": ""
  }
}

Rules:
- Extract only facts stated or strongly implied.
- Use empty strings for unknown fields.
- Use "New" unless another status is explicitly stated.
- If the speaker is describing a new prospect, use create_lead.
- If the speaker clearly says an existing prospect has changed, use update_lead.
- If there is not enough lead information to act, use no_action.
- Do not invent phone numbers, budgets, locations, or names.

User update:
${text}`;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const {text}=req.body||{};
    if(!text?.trim()) return res.status(400).json({error:"Update is required"});
    const base=process.env.GEMMA_BASE_URL||"http://localhost:11434";
    const model=process.env.GEMMA_MODEL||"gemma3:1b";
    const response=await fetch(`${base}/api/generate`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model,prompt:buildPrompt(text),stream:false,format:"json"})
    });
    if(!response.ok) throw new Error(`Gemma request failed (${response.status})`);
    const data=await response.json();
    const result=JSON.parse(data.response);
    return res.status(200).json({action:result.action||"no_action",lead:{...schema.lead,...(result.lead||{})}});
  }catch(error){
    return res.status(500).json({error:error.message||"Gemma assistant failed"});
  }
}
