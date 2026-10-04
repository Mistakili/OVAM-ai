import {defineConfig,loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import gemmaVoice from "./api/gemma-voice.js";

function voiceTokenApi(){
  return {
    name:"assemblyai-voice-token",
    configureServer(server){
      server.middlewares.use("/api/assemblyai-token",async(req,res,next)=>{
        if(req.method!=="GET")return next();
        try{
          const env=loadEnv(server.config.mode,process.cwd(),"");
          const key=env.ASSEMBLYAI_API_KEY;
          const agentId=env.ASSEMBLYAI_AGENT_ID;
          if(!key||!agentId){res.statusCode=500;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:"Voice Agent environment is not configured"}))}
          const url=new URL("https://agents.assemblyai.com/v1/token");
          url.searchParams.set("expires_in_seconds","300");
          const response=await fetch(url,{headers:{Authorization:"Bearer "+key}});
          const data=await response.json();
          if(!response.ok){res.statusCode=response.status;res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({error:data?.error||"Voice token request failed"}))}
          res.statusCode=200;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({token:data.token,agentId}));
        }catch(error){res.statusCode=500;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:error.message||"Voice token service failed"}))}
      });
      server.middlewares.use("/api/chat/completions",async(req,res)=>{
        const env=loadEnv(server.config.mode,process.cwd(),"");
        process.env.GEMINI_API_KEY=process.env.GEMINI_API_KEY||env.GEMINI_API_KEY;
        process.env.GEMMA_MODEL=process.env.GEMMA_MODEL||env.GEMMA_MODEL;
        process.env.GEMMA_VOICE_TOKEN=process.env.GEMMA_VOICE_TOKEN||env.GEMMA_VOICE_TOKEN;
        await gemmaVoice(req,res);
      });
    }
  };
}

export default defineConfig({plugins:[react(),voiceTokenApi()]});