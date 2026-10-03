const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

function buildPrompt(text){
  return `You are OVAM AI, a Nigerian real-estate CRM assistant.
Understand the user's natural update and decide what CRM action should happen.

Return ONLY valid JSON with exactly:
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
- Unknown fields must be empty strings.
- Never invent names, phone numbers, budgets, locations, or timelines.
- Use create_lead for a new prospect.
- Use update_lead when the user clearly describes a change to an existing prospect.
- Use no_action when there is not enough information to make a CRM change.
- Keep budget and timeline in natural language.
- Return JSON only.

User update:
${text}`;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const {text}=req.body||{};
    if(!text?.trim()) return res.status(400).json({error:"Update is required"});
    if(!process.env.GEMINI_API_KEY) return res.status(500).json({error:"GEMINI_API_KEY is not configured"});

    const model=process.env.GEMMA_MODEL||"gemma-4-26b-a4b-it";
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-goog-api-key":process.env.GEMINI_API_KEY
      },
      body:JSON.stringify({
        contents:[{parts:[{text:buildPrompt(text)}]}],
        generationConfig:{responseMimeType:"application/json"}
      })
    });

    if(!response.ok){
      const detail=await response.text();
      throw new Error(`Gemma request failed (${response.status}): ${detail.slice(0,300)}`);
    }

    const data=await response.json();
    const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!raw) throw new Error("Gemma returned no structured response");
    const result=JSON.parse(raw);

    return res.status(200).json({
      action:result.action||"no_action",
      lead:{...emptyLead,...(result.lead||{})}
    });
  }catch(error){
    return res.status(500).json({error:error.message||"Gemma assistant failed"});
  }
}
