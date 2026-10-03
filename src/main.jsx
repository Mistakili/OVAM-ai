import React,{useEffect,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const emptyLead={name:"",phone:"",email:"",property:"",location:"",budget:"",dealPrice:"",deposit:"",paymentPlan:"",paymentFrequency:"",amountPaid:"",balance:"",timeline:"",nextFollowUp:"",nextAction:"",status:"New",source:"",preferredContact:"",objections:"",notes:""};
const fieldLabels={name:"Name",phone:"Phone",email:"Email",property:"Property",location:"Location",budget:"Budget",dealPrice:"Deal price",deposit:"Deposit",paymentPlan:"Payment plan",paymentFrequency:"Payment frequency",amountPaid:"Amount paid",balance:"Balance",timeline:"Purchase timeline",nextFollowUp:"Next follow-up",nextAction:"Next action",status:"Status",source:"Lead source",preferredContact:"Preferred contact",objections:"Objections",notes:"Notes"};

function bytesToBase64(buffer){
  const bytes=new Uint8Array(buffer);let binary="";
  const step=0x8000;
  for(let i=0;i<bytes.length;i+=step) binary+=String.fromCharCode(...bytes.subarray(i,i+step));
  return btoa(binary);
}
function base64ToInt16(base64){
  const binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function App(){
  const [input,setInput]=useState("");
  const [lead,setLead]=useState(null);
  const [loading,setLoading]=useState(false);
  const [list,setList]=useState(()=>JSON.parse(localStorage.getItem("ovam-leads")||"[]"));
  const [voiceState,setVoiceState]=useState("idle");
  const [micLevel,setMicLevel]=useState(0);
  const [message,setMessage]=useState("");
  const [conversation,setConversation]=useState([]);
  const [lastVoiceEvent,setLastVoiceEvent]=useState("");
  const voiceSession=useRef({stream:null,ctx:null,worklet:null,source:null,socket:null});
  const voiceActiveRef=useRef(false);
  const sessionReadyRef=useRef(false);
  const leadDraftRef=useRef({...emptyLead});
  const pendingToolsRef=useRef([]);
  const playbackSourcesRef=useRef(new Set());
  const playbackCursorRef=useRef(0);
  const demoLead="I just spoke to Sarah. She wants a residential plot around Akobo, Ibadan for about 10 million naira. She can pay 3 million down and spread the balance over 12 months. She wants to buy within two months, and I should call her next Friday. She came from Instagram and prefers WhatsApp.";

  async function extractLead(text=input){
    if(!text.trim())return;
    setLoading(true);setMessage("");
    try{
      const res=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,currentLead:leadDraftRef.current})});
      const raw=await res.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{throw new Error("CRM endpoint returned invalid JSON: "+raw.slice(0,180))}if(!res.ok)throw new Error(data.error||"Could not process update");
      const merged={...emptyLead,...leadDraftRef.current,...(data.lead||{})};
      leadDraftRef.current=merged;setLead(merged);
    }catch(e){setMessage(e.message||"Something went wrong")}finally{setLoading(false)}
  }

  function saveLead(){
    if(!lead)return;
    const existing=JSON.parse(localStorage.getItem("ovam-leads")||"[]");
    const next=[{...lead,id:Date.now()},...existing];
    localStorage.setItem("ovam-leads",JSON.stringify(next));setList(next);
    leadDraftRef.current={...emptyLead};setInput("");setLead(null);setMessage("Lead saved to OVAM CRM.");
  }

  function stopPlayback(){
    playbackSourcesRef.current.forEach(source=>{try{source.stop()}catch{}});
    playbackSourcesRef.current.clear();
    playbackCursorRef.current=0;
  }

  function playReplyAudio(base64){
    const ctx=voiceSession.current.ctx;
    if(!ctx||!base64)return;
    try{
      const pcm=base64ToInt16(base64);
      const audio=ctx.createBuffer(1,pcm.length,24000);
      const data=audio.getChannelData(0);
      for(let i=0;i<pcm.length;i++)data[i]=pcm[i]/32768;
      const source=ctx.createBufferSource();
      source.buffer=audio;source.connect(ctx.destination);
      const start=Math.max(ctx.currentTime+0.02,playbackCursorRef.current||0);
      source.start(start);playbackCursorRef.current=start+audio.duration;
      playbackSourcesRef.current.add(source);
      source.onended=()=>playbackSourcesRef.current.delete(source);
    }catch{}
  }

  function addConversation(role,text){
    if(!text?.trim())return;
    setConversation(prev=>{
      const last=prev[prev.length-1];
      if(last?.role===role&&last.text===text)return prev;
      return [...prev,{role,text:text.trim()}];
    });
  }

  function runTool(call){
    const args=call.arguments||{};
    if(call.name==="update_lead"){
      const merged={...emptyLead,...leadDraftRef.current};
      for(const [key,value] of Object.entries(args))if(value!==undefined&&value!==null&&String(value).trim()!=="")merged[key]=String(value);
      leadDraftRef.current=merged;setLead(merged);
      return {ok:true,draft:merged};
    }
    if(call.name==="save_lead"){
      const draft={...emptyLead,...leadDraftRef.current};
      if(!draft.name||!draft.phone)return {ok:false,error:"The lead still needs a name and phone number."};
      const existing=JSON.parse(localStorage.getItem("ovam-leads")||"[]");
      const saved={...draft,id:Date.now()};
      const next=[saved,...existing];
      localStorage.setItem("ovam-leads",JSON.stringify(next));setList(next);
      leadDraftRef.current={...emptyLead};setLead(null);setInput("");
      return {ok:true,saved_lead:saved};
    }
    return {ok:false,error:"Unknown tool"};
  }

  function sendPendingTools(){
    const socket=voiceSession.current.socket;
    if(!socket||socket.readyState!==WebSocket.OPEN||!pendingToolsRef.current.length)return;
    const calls=pendingToolsRef.current.splice(0);
    for(const item of calls){
      try{socket.send(JSON.stringify({type:"tool.result",call_id:item.call_id,result:JSON.stringify(item.result)}))}catch{}
    }
  }

  function stopVoice(){
    voiceActiveRef.current=false;sessionReadyRef.current=false;
    stopPlayback();pendingToolsRef.current=[];
    const s=voiceSession.current;
    try{s.socket?.send(JSON.stringify({type:"session.end"}))}catch{}
    try{s.socket?.close()}catch{}
    try{s.stream?.getTracks().forEach(t=>t.stop())}catch{}
    try{s.worklet?.disconnect()}catch{}
    try{s.source?.disconnect()}catch{}
    try{s.ctx?.close()}catch{}
    voiceSession.current={stream:null,ctx:null,worklet:null,source:null,socket:null};
    setMicLevel(0);setVoiceState("idle");
  }

  async function startVoice(){
    if(voiceState!=="idle")return;
    setMessage("");setInput("");setLead(null);setConversation([]);setLastVoiceEvent("");
    leadDraftRef.current={...emptyLead};pendingToolsRef.current=[];
    playbackCursorRef.current=0;voiceActiveRef.current=true;sessionReadyRef.current=false;
    setVoiceState("connecting");setMicLevel(0);
    try{
      const tokenController=new AbortController();
      const tokenTimeout=setTimeout(()=>tokenController.abort(),10000);
      let tokenRes;
      try{
        tokenRes=await fetch("/api/assemblyai-token",{cache:"no-store",signal:tokenController.signal});
      }catch(error){
        if(error?.name==="AbortError")throw new Error("Voice token request timed out. The voice backend is not responding.");
        throw new Error("Could not reach the voice backend: "+(error?.message||"network error"));
      }finally{
        clearTimeout(tokenTimeout);
      }
      const tokenText=await tokenRes.text();
      let tokenData={};
      try{tokenData=tokenText?JSON.parse(tokenText):{}}catch{throw new Error("Voice token endpoint returned invalid JSON: "+tokenText.slice(0,180))};
      if(!tokenRes.ok)throw new Error(tokenData.error||"Could not start voice service");
      const agentId=tokenData.agentId;
      if(!agentId)throw new Error("ASSEMBLYAI_AGENT_ID is not configured for this deployment.");

      const ctx=new AudioContext({sampleRate:24000});await ctx.resume();
      await ctx.audioWorklet.addModule("/pcm-processor.js");
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("This browser does not allow microphone access here. Use HTTPS or localhost.");
      let stream;
      try{
        stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      }catch(error){
        if(error?.name==="NotAllowedError"||error?.name==="PermissionDeniedError")throw new Error("Microphone permission was blocked. Allow microphone access for this site, then tap the mic again.");
        if(error?.name==="NotFoundError")throw new Error("No microphone was found. Connect a microphone and try again.");
        if(error?.name==="NotReadableError")throw new Error("The microphone is busy or unavailable. Close other apps using it and try again.");
        throw new Error("Could not access the microphone: "+(error?.message||error?.name||"unknown error"));
      }
      const worklet=new AudioWorkletNode(ctx,"pcm-processor");
      const source=ctx.createMediaStreamSource(stream);source.connect(worklet);
      const socket=new WebSocket("wss://agents.assemblyai.com/v1/ws?token="+encodeURIComponent(tokenData.token));
      voiceSession.current={stream,ctx,worklet,source,socket};

      worklet.port.onmessage=e=>{
        setMicLevel(e.data.level||0);
        if(sessionReadyRef.current&&socket.readyState===WebSocket.OPEN){
          socket.send(JSON.stringify({type:"input.audio",audio:bytesToBase64(e.data.pcm)}));
        }
      };


      socket.onopen=()=>{
        socket.send(JSON.stringify({type:"session.update",session:{agent_id:agentId}}));
      };

      socket.onmessage=event=>{
        let data;try{data=JSON.parse(event.data)}catch{return}
        setLastVoiceEvent(data.type||"unknown");
        console.log("[OVAM AI voice]",data);
        switch(data.type){
          case"session.ready":
            sessionReadyRef.current=true;
            setVoiceState("listening");
            break;
          case"input.speech.started":
            stopPlayback();setVoiceState("listening");break;
          case"transcript.user.delta":
            setInput(data.text||"");break;
          case"transcript.user":
            if(data.text){
              setInput(data.text);addConversation("user",data.text);
              // Explicitly request the agent to generate the next reply. This is
              // supported by the Voice Agent API and prevents a stored-agent
              // session from ending the turn without entering generation.
              try{
                if(socket.readyState===WebSocket.OPEN){
                  socket.send(JSON.stringify({type:"reply.create"}));
                }
              }catch{}
            }
            break;
          case"reply.started":
            setVoiceState("speaking");break;
          case"reply.audio":
            playReplyAudio(data.data);break;
          case"transcript.agent":
            if(data.text)addConversation("assistant",data.text);
            if(!data.interrupted)setVoiceState("speaking");
            break;
          case"tool.call":
            pendingToolsRef.current.push({call_id:data.call_id,result:runTool(data)});
            break;
          case"input.speech.stopped":
            setVoiceState("listening");
            break;
          case"reply.done":
            if(data.status==="interrupted"){pendingToolsRef.current=[];stopPlayback();setVoiceState("listening")}
            else{
              sendPendingTools();
              if(voiceActiveRef.current)setVoiceState("listening");
            }
            break;
          case"session.error":
            setMessage("Voice agent error: "+(data.code||"unknown")+" — "+(data.message||"Unknown session error"));
            setVoiceState("listening");
            break;
          case"session.ended":
            if(voiceActiveRef.current)stopVoice();break;
          default:break;
        }
      };
      socket.onerror=()=>{setMessage("AssemblyAI voice connection failed. Check the token/agent configuration.");};
      socket.onclose=event=>{
        if(voiceActiveRef.current){
          voiceActiveRef.current=false;
          sessionReadyRef.current=false;
          setVoiceState("idle");
          setMicLevel(0);
          if(event.code!==1000){
            setMessage("Voice connection closed before the session became ready (code "+event.code+"). Tap the mic again for a fresh token.");
          }
        }
      };
    }catch(e){
      try{voiceSession.current.socket?.close()}catch{}
      try{voiceSession.current.stream?.getTracks().forEach(t=>t.stop())}catch{}
      try{voiceSession.current.ctx?.close()}catch{}
      voiceActiveRef.current=false;sessionReadyRef.current=false;setVoiceState("idle");setMicLevel(0);
      setMessage(e.message||"Could not start voice input");
    }
  }

  useEffect(()=>()=>{if(voiceActiveRef.current)stopVoice()},[]);

  const voiceLabel=voiceState==="connecting"?"Connecting…":voiceState==="listening"?"Listening…":voiceState==="speaking"?"OVAM is speaking…":"Talk to OVAM AI";

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="eyebrow">OVAM REALTY</span><h1>OVAM AI</h1><p>Your real-estate assistant.</p></div>
      <div className="ai-pill"><span className="pulse-dot"></span> Gemma-powered</div>
    </header>

    <section className="hero">
      <div className="hero-copy"><span className="kicker">THE OVAM AI ASSISTANT</span><h2>Tell me what happened.<br/><em>I’ll handle the CRM.</em></h2><p>After a call, meeting, or site visit, just tell OVAM AI what you learned about the prospect. It turns the conversation into a clean lead record.</p></div>

      <div className={"voice-panel "+voiceState}>
        <button className={"voice-orb "+(voiceState==="listening"||voiceState==="speaking"?"live":"")} onClick={voiceState==="idle"?startVoice:stopVoice} disabled={loading||voiceState==="connecting"}>
          <span className="orb-ring ring-one"></span><span className="orb-ring ring-two"></span><span className="mic">{voiceState==="idle"?"●":"■"}</span>
        </button>
        <strong>{voiceLabel}</strong>
        {(voiceState==="listening"||voiceState==="speaking")&&<div className="live-meter"><span className="live-dot"></span><span>VOICE LIVE</span><div className="meter-bars">{[1,2,3,4,5,6,7].map(i=><i key={i} style={{transform:"scaleY("+Math.max(.18,micLevel*(.55+(i%3)*.18))+")"}}/> )}</div><button className="stop-voice" onClick={stopVoice}>End</button></div>}
        {input&&voiceState!=="idle"&&<div className="live-transcript">{input}</div>}
        {conversation.length>0&&<div className="voice-conversation">{conversation.slice(-8).map((m,i)=><div key={i} className={m.role}>{m.role==="user"?"You":"OVAM AI"}: {m.text}</div>)}</div>}
        <span>{voiceState==="listening"?"Speak naturally about the prospect.":voiceState==="speaking"?"You can interrupt OVAM at any time.":voiceState==="connecting"?"Starting the live voice session.":"Tap the microphone and tell OVAM AI what happened."}</span>{lastVoiceEvent&&voiceState!=="idle"&&<small className="voice-debug">Event: {lastVoiceEvent}</small>}
      </div>

      <div className="text-fallback">
        <div className="fallback-label"><span>Prefer typing?</span><button className="demo" onClick={()=>{setInput(demoLead);setMessage("")}}>Try a real example</button></div>
        <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="I just spoke to Sarah. She wants land around Akobo…"/>
        <button className="text-action" onClick={()=>extractLead()} disabled={loading||!input.trim()}>{loading?"Understanding…":"Understand this lead →"}</button>
      </div>
      {message&&<div className="message">{message}</div>}
    </section>

    {lead&&<section className="lead-card card">
      <div className="lead-head"><div><span className="kicker">AI CAPTURED</span><h2>{lead.name||"New prospect"}</h2><p>{lead.property||"Property interest"}{lead.location?" · "+lead.location:""}</p></div><span className="status">{lead.status||"New"}</span></div>
      <div className="lead-grid">{Object.entries(lead).map(([key,value])=><label key={key}><span>{fieldLabels[key]||key}</span><input value={value||""} onChange={e=>setLead({...lead,[key]:e.target.value})}/></label>)}</div>
      <div className="lead-actions"><button className="save" onClick={saveLead}>Save to OVAM CRM</button><button className="secondary" onClick={()=>setLead(null)}>Edit later</button></div>
    </section>}

    <section className="recent card">
      <div className="section-head"><div><span className="kicker">YOUR PIPELINE</span><h2>Recent leads</h2></div><span className="count">{list.length}</span></div>
      {!list.length?<div className="empty"><strong>Your CRM is ready.</strong><span>Tell OVAM AI about your first prospect.</span></div>:<div className="leads">{list.map(x=><article key={x.id}><div className="avatar">{(x.name||"?").slice(0,1).toUpperCase()}</div><div><strong>{x.name||"Unnamed lead"}</strong><span>{x.property||"Property"} · {x.location||"Location"}</span><small>{x.budget||"Budget not captured"} · {x.timeline||"Timeline not captured"}</small></div><b>{x.status||"New"}</b></article>)}</div>}
    </section>
    <footer><span>OVAM AI</span><span>Built for OVAM Realty · Gemma at the core</span></footer>
  </main>
}
createRoot(document.getElementById("root")).render(<App/>);