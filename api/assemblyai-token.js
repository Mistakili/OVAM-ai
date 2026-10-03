export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  const key=process.env.ASSEMBLYAI_API_KEY;
  if(!key) return res.status(500).json({error:"ASSEMBLYAI_API_KEY is not configured"});
  try{
    const url=new URL("https://agents.assemblyai.com/v1/token");
    url.searchParams.set("expires_in_seconds","300");
    const r=await fetch(url,{headers:{Authorization:"Bearer "+key}});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.error||"AssemblyAI voice token request failed"});
    return res.status(200).json({token:data.token});
  }catch(error){return res.status(500).json({error:error.message||"Voice token service failed"});}
}