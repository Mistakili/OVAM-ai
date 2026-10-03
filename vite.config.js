import {defineConfig,loadEnv} from "vite";
import react from "@vitejs/plugin-react";

function assemblyAITokenApi(){
  return {
    name:"assemblyai-token-api",
    configureServer(server){
      server.middlewares.use("/api/assemblyai-token",async(req,res,next)=>{
        if(req.method!=="GET") return next();
        try{
          const env=loadEnv(server.config.mode,process.cwd(),"");
          const key=env.ASSEMBLYAI_API_KEY;
          if(!key){
            res.statusCode=500; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:"ASSEMBLYAI_API_KEY is not configured"}));
          }
          const url=new URL("https://streaming.assemblyai.com/v3/token");
          url.searchParams.set("expires_in_seconds","300");
          const response=await fetch(url,{headers:{Authorization:key}});
          const data=await response.json();
          if(!response.ok){
            res.statusCode=response.status; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:data?.error||"AssemblyAI token request failed"}));
          }
          res.statusCode=200; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({token:data.token}));
        }catch(error){
          res.statusCode=500; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({error:error.message||"Voice token service failed"}));
        }
      });
    }
  };
}

function geminiDevApi(){
  return {
    name:"gemini-dev-api",
    configureServer(server){
      server.middlewares.use("/api/assistant",async(req,res,next)=>{
        if(req.method!=="POST") return next();
        try{
          let body="";
          for await(const chunk of req) body+=chunk;
          const {text,history=[],currentLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""}}=JSON.parse(body||"{}");
          if(!text?.trim()){
            res.statusCode=400; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:"Message is required"}));
          }
          const env=loadEnv(server.config.mode,process.cwd(),"");
          const apiKey=env.GEMINI_API_KEY;
          const model=env.GEMMA_MODEL||"gemma-4-26b-a4b-it";
          if(!apiKey){
            res.statusCode=500; res.setHeader("Content-Type","application/json");
            return res.end(JSON.stringify({error:"GEMINI_API_KEY is not configured"}));
          }
          const leadSchema={
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
          const prompt=\`You are OVAM AI, a warm and concise Nigerian real-estate CRM assistant.

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
          const response=await fetch(\`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent\`,{
            method:"POST",
            headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
            body:JSON.stringify({
              contents:[{parts:[{text:prompt}]}],
              generationConfig:{responseMimeType:"application/json",responseSchema:leadSchema}
            })
          });
          const rawText=await response.text();
          if(!response.ok) throw new Error(\`Gemma request failed (\${response.status}): \${rawText.slice(0,300)}\`);
          const data=JSON.parse(rawText);
          const raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if(!raw) throw new Error("Gemma returned no structured response");
          const cleaned=String(raw).trim().replace(/^\`\`\`(?:json)?\s*/i,"").replace(/\s*\`\`\`$/,"");
          let result;
          try{result=JSON.parse(cleaned)}catch{
            const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");
            if(start===-1||end<=start) throw new Error("Gemma returned text instead of the expected CRM JSON.");
            result=JSON.parse(cleaned.slice(start,end+1));
          }
          const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};
          res.statusCode=200; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({action:result.action||"no_action",reply:result.reply||"",lead:{...emptyLead,...currentLead,...(result.lead||{})}}));
        }catch(error){
          res.statusCode=500; res.setHeader("Content-Type","application/json");
          res.end(JSON.stringify({error:error.message||"Gemma assistant failed"}));
        }
      });
    }
  };
}
export default defineConfig({plugins:[react(),assemblyAITokenApi(),geminiDevApi()]});
