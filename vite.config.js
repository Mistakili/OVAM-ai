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
          if(!key){res.statusCode=500;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:"ASSEMBLYAI_API_KEY is not configured"}));}
          const url=new URL("https://streaming.assemblyai.com/v3/token");
          url.searchParams.set("expires_in_seconds","300");
          const response=await fetch(url,{headers:{Authorization:key}});
          const data=await response.json();
          if(!response.ok){res.statusCode=response.status;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:data?.error||"AssemblyAI token request failed"}));}
          res.statusCode=200;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({token:data.token}));
        }catch(error){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:error.message||"Voice token service failed"}));}
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
          let body="";for await(const chunk of req) body+=chunk;
          const parsed=JSON.parse(body||"{}");
          const text=parsed.text,history=parsed.history||[];
          const currentLead=parsed.currentLead||{name:"",phone:"",email:"",property:"",location:"",budget:"",dealPrice:"",deposit:"",paymentPlan:"",paymentFrequency:"",amountPaid:"",balance:"",timeline:"",nextFollowUp:"",nextAction:"",status:"New",source:"",preferredContact:"",objections:"",notes:""};
          if(!text?.trim()){res.statusCode=400;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:"Message is required"}));}
          const env=loadEnv(server.config.mode,process.cwd(),"");
          const apiKey=env.GEMINI_API_KEY,model=env.GEMMA_MODEL||"gemma-4-26b-a4b-it";
          if(!apiKey){res.statusCode=500;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:"GEMINI_API_KEY is not configured"}));}
          const leadSchema={type:"object",properties:{
            action:{type:"string",enum:["create_lead","update_lead","ask_question","no_action"]},reply:{type:"string"},
            lead:{type:"object",properties:{name:{type:"string"},phone:{type:"string"},email:{type:"string"},property:{type:"string"},location:{type:"string"},budget:{type:"string"},dealPrice:{type:"string"},deposit:{type:"string"},paymentPlan:{type:"string"},paymentFrequency:{type:"string"},amountPaid:{type:"string"},balance:{type:"string"},timeline:{type:"string"},nextFollowUp:{type:"string"},nextAction:{type:"string"},status:{type:"string"},source:{type:"string"},preferredContact:{type:"string"},objections:{type:"string"},notes:{type:"string"}},required:["name","phone","email","property","location","budget","dealPrice","deposit","paymentPlan","paymentFrequency","amountPaid","balance","timeline","nextFollowUp","nextAction","status","source","preferredContact","objections","notes"]}},required:["action","reply","lead"]};
          const prompt=["You are OVAM AI, a warm and concise Nigerian real-estate CRM assistant.","","Your job is to listen to what an agent says about a prospect and maintain a complete running CRM record.","The agent should be able to speak naturally after a call, meeting, site visit, payment discussion, or follow-up.","","Return ONLY one JSON object matching the supplied schema.","","Rules:","- Treat CURRENT LEAD as the source of truth for facts already collected.","- Merge new facts into CURRENT LEAD. Never erase a known field unless the user corrects it.","- Extract phone numbers exactly as spoken when clear. Preserve leading zeroes.","- Never invent dates, money, contact details, payment terms, or other facts.","- Capture payment details when mentioned: deal price, deposit, payment plan, payment frequency, amount paid, and balance.","- Capture follow-up details when mentioned: nextFollowUp and nextAction. Keep relative dates exactly as stated, such as \"next Friday\" or \"in two weeks\".","- Capture source, preferred contact method, objections, and important notes when mentioned.","- Do not force the agent to provide every field.","- Ask ONE short natural question only when a missing detail is important to move the lead forward.","- Never ask for a field that has already been answered.","- If the user gives enough information to create a useful lead, use action \"create_lead\".","- If the user clearly corrects or changes an existing lead, use action \"update_lead\".","- If the user is only greeting or chatting without a CRM-relevant update, use action \"no_action\".","- reply is exactly what OVAM AI should say aloud. Keep it warm, natural and brief.","- Return the COMPLETE merged lead on every response.","- Unknown fields must be empty strings.","","CURRENT LEAD:",JSON.stringify(currentLead),"","CONVERSATION:",history.map(x=>x.role.toUpperCase()+": "+x.text).join("\n"),"","LATEST USER MESSAGE:",text].join("\n");
          const url="https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent";
          const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseSchema:leadSchema}})});
          const rawText=await response.text();
          if(!response.ok) throw new Error("Gemma request failed ("+response.status+"): "+rawText.slice(0,300));
          const data=JSON.parse(rawText),raw=data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if(!raw) throw new Error("Gemma returned no structured response");
          const cleaned=String(raw).trim().replace(/^\s*\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60\s*$/,"");
          let result;try{result=JSON.parse(cleaned)}catch{const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");if(start===-1||end<=start)throw new Error("Gemma returned text instead of the expected CRM JSON.");result=JSON.parse(cleaned.slice(start,end+1));}
          const emptyLead={name:"",phone:"",email:"",property:"",location:"",budget:"",dealPrice:"",deposit:"",paymentPlan:"",paymentFrequency:"",amountPaid:"",balance:"",timeline:"",nextFollowUp:"",nextAction:"",status:"New",source:"",preferredContact:"",objections:"",notes:""};
          res.statusCode=200;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({action:result.action||"no_action",reply:result.reply||"",lead:{...emptyLead,...currentLead,...(result.lead||{})}}));
        }catch(error){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:error.message||"Gemma assistant failed"}));}
      });
    }
  };
}
export default defineConfig({plugins:[react(),assemblyAITokenApi(),geminiDevApi()]});