import {defineConfig,loadEnv} from "vite";
import react from "@vitejs/plugin-react";

function geminiDevApi(){
  return {
    name:"gemini-dev-api",
    configureServer(server){
      server.middlewares.use("/api/assistant",async(req,res,next)=>{
        if(req.method!=="POST") return next();
        try{
          let body="";
          for await(const chunk of req) body+=chunk;
          const {text}=JSON.parse(body||"{}");
          if(!text?.trim()){
            res.statusCode=400; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:"Update is required"}));
          }

          const env=loadEnv(server.config.mode,process.cwd(),"");
          const apiKey=env.GEMINI_API_KEY;
          const model=env.GEMMA_MODEL||"gemma-4-26b-a4b-it";
          if(!apiKey){
            res.statusCode=500; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:"GEMINI_API_KEY is not configured"}));
          }

          const prompt=`You are OVAM AI, a Nigerian real-estate CRM assistant.
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

          const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
            method:"POST",
            headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
            body:JSON.stringify({
              contents:[{parts:[{text:prompt}]}],
              generationConfig:{responseMimeType:"application/json"}
            })
          });

          const rawText=await response.text();
          if(!response.ok) throw new Error(`Gemma request failed (${response.status}): ${rawText.slice(0,300)}`);
          const data=JSON.parse(rawText);
          const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if(!raw) throw new Error("Gemma returned no structured response");
          const result=JSON.parse(raw);
          const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

          res.statusCode=200; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({action:result.action||"no_action",lead:{...emptyLead,...(result.lead||{})}}));
        }catch(error){
          res.statusCode=500; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({error:error.message||"Gemma assistant failed"}));
        }
      });
    }
  };
}

export default defineConfig({plugins:[react(),geminiDevApi()]});