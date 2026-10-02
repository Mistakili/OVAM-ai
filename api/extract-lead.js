const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

const prompt=(text)=>`You are the lead extraction engine for OVAM Realty, a real-estate business focused on land/property sales in Nigeria.
Extract only information explicitly stated or strongly implied in the user's description.
Return ONLY valid JSON with exactly these keys:
name, phone, property, location, budget, timeline, status, notes.
Use empty strings for unknown values. Keep budget and timeline as natural-language values. Set status to "New" unless another status is explicitly stated.
Lead description:
${text}`;

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try{
    const {text}=req.body||{};
    if(!text?.trim()) return res.status(400).json({error:"Lead description is required"});

    const base=process.env.GEMMA_BASE_URL||"http://localhost:11434";
    const model=process.env.GEMMA_MODEL||"gemma3:1b";
    const response=await fetch(`${base}/api/generate`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model,prompt:prompt(text),stream:false,format:"json"})
    });
    if(!response.ok) throw new Error(`Gemma request failed (${response.status})`);
    const data=await response.json();
    let lead;
    try{lead=JSON.parse(data.response)}catch{throw new Error("Gemma returned invalid JSON")};
    return res.status(200).json({lead:{...emptyLead,...lead}});
  }catch(error){
    return res.status(500).json({error:error.message||"Gemma is not available"});
  }
}