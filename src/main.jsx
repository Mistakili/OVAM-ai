import React,{useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const emptyLead={name:"",phone:"",email:"",property:"",location:"",budget:"",dealPrice:"",deposit:"",paymentPlan:"",paymentFrequency:"",amountPaid:"",balance:"",timeline:"",nextFollowUp:"",nextAction:"",status:"New",source:"",preferredContact:"",objections:"",notes:""};

const fieldLabels={name:"Name",phone:"Phone",email:"Email",property:"Property",location:"Location",budget:"Budget",dealPrice:"Deal price",deposit:"Deposit",paymentPlan:"Payment plan",paymentFrequency:"Payment frequency",amountPaid:"Amount paid",balance:"Balance",timeline:"Purchase timeline",nextFollowUp:"Next follow-up",nextAction:"Next action",status:"Status",source:"Lead source",preferredContact:"Preferred contact",objections:"Objections",notes:"Notes"};

function App(){
  const [input,setInput]=useState("");
  const [lead,setLead]=useState(null);
  const [loading,setLoading]=useState(false);
  const [list,setList]=useState(()=>JSON.parse(localStorage.getItem("ovam-leads")||"[]"));
  const [voiceState,setVoiceState]=useState("idle");
  const [micLevel,setMicLevel]=useState(0);
  const [message,setMessage]=useState("");
  const voiceSession=useRef({stream:null,ctx:null,worklet:null,socket:null});
  const processingRef=useRef(false);
  const acceptingAudioRef=useRef(false);
  const voiceActiveRef=useRef(false);
  const historyRef=useRef([]);
  const leadDraftRef=useRef(emptyLead);
  const [conversation,setConversation]=useState([]);
  const awaitingSaveRef=useRef(false);
  const demoLead="I just spoke to Sarah. She wants a residential plot around Akobo, Ibadan for about 10 million naira. She can pay 3 million down and spread the balance over 12 months. She wants to buy within two months, and I should call her next Friday. She came from Instagram and prefers WhatsApp.";

  async function extractLead(text=input){
    if(!text.trim()) return;
    setLoading(true); setMessage("");
    try{
      const res=await fetch("/api/assistant",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text,currentLead:leadDraftRef.current})
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Could not process update");
      if((data.action||"create_lead")==="no_action") throw new Error("I need a little more lead information before I can create a CRM record.");
      const merged={...emptyLead,...leadDraftRef.current,...(data.lead||{})};
      leadDraftRef.current=merged;
      setLead(merged);
    }catch(e){setMessage(e.message||"Something went wrong")}
    finally{setLoading(false)}
  }

  function saveLead(){
    if(!lead) return;
    const next=[{...lead,id:Date.now()},...list];
    setList(next); localStorage.setItem("ovam-leads",JSON.stringify(next));
    leadDraftRef.current=emptyLead;
    setInput(""); setLead(null); setMessage("Lead saved to OVAM CRM.");
  }

  function preferredSpeechVoice(){
    if(!("speechSynthesis" in window)) return null;
    const voices=window.speechSynthesis.getVoices();
    const preferred=[
      /Microsoft Jenny.*English/i,
      /Microsoft Aria.*English/i,
      /Microsoft Ava.*English/i,
      /Microsoft Sonia.*English/i,
      /Microsoft Zira.*English/i,
      /Google UK English Female/i,
      /Google US English/i,
      /Samantha/i,
      /Karen/i
    ];
    for(const pattern of preferred){
      const voice=voices.find(v=>pattern.test(v.name));
      if(voice) return voice;
    }
    return voices.find(v=>/^en(-|_)/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||null;
  }

  async function speakReply(text){
    if(!text||!("speechSynthesis" in window)) return;
    if(!window.speechSynthesis.getVoices().length){
      await new Promise(resolve=>{
        const timer=setTimeout(resolve,250);
        window.speechSynthesis.addEventListener("voiceschanged",()=>{clearTimeout(timer);resolve()},{once:true});
      });
    }
    return new Promise(resolve=>{
      window.speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(text);
      const voice=preferredSpeechVoice();
      if(voice) utterance.voice=voice;
      utterance.lang=voice?.lang||"en-NG";
      utterance.rate=0.92;
      utterance.pitch=1;
      utterance.volume=1;
      utterance.onend=resolve;
      utterance.onerror=resolve;
      window.speechSynthesis.speak(utterance);
    });
  }

  function stopVoice(){
    voiceActiveRef.current=false;
    acceptingAudioRef.current=false;
    processingRef.current=false;
    try{window.speechSynthesis?.cancel()}catch{}
    const s=voiceSession.current;
    try{s.socket?.send(JSON.stringify({type:"Terminate"}))}catch{}
    try{s.socket?.close()}catch{}
    try{s.stream?.getTracks().forEach(t=>t.stop())}catch{}
    try{s.worklet?.disconnect()}catch{}
    try{s.ctx?.close()}catch{}
    voiceSession.current={stream:null,ctx:null,worklet:null,socket:null};
    setMicLevel(0);
    setVoiceState("idle");
  }

  async function handleVoiceTurn(text){
    if(!text?.trim()||processingRef.current||!voiceActiveRef.current)return;
    try{voiceSession.current.socket?.send(JSON.stringify({type:"UpdateConfiguration",mode:"balanced"}))}catch{}
    processingRef.current=true;
    acceptingAudioRef.current=false;
    setVoiceState("processing");
    setInput(text);

    const nextHistory=[...historyRef.current,{role:"user",text}];

    if(awaitingSaveRef.current){
      if(/^(yes|yeah|yep|sure|okay|ok|save|save it|go ahead|do it|please do|please save)\b/i.test(text.trim())){
        awaitingSaveRef.current=false;
        const savedLead=leadDraftRef.current;
        const next=[{...savedLead,id:Date.now()},...list];
        setList(next); localStorage.setItem("ovam-leads",JSON.stringify(next));
        setMessage("Lead saved to OVAM CRM.");
        const savedReply="Done. I've saved the lead to OVAM CRM.";
        setConversation([...historyRef.current,{role:"user",text},{role:"assistant",text:savedReply}]);
        historyRef.current=[...historyRef.current,{role:"user",text},{role:"assistant",text:savedReply}];
        leadDraftRef.current=emptyLead;
        setLead(null); setInput("");
        stopVoice();
        return;
      }

      const declinedSave=/^(no|nope)\b/i.test(text.trim());
      const clearlyNeedsMoreInfo=/\b(still have|other things|something else|more to add|more information|not yet|don't save|do not save)\b/i.test(text.trim());

      if(declinedSave && clearlyNeedsMoreInfo){
        awaitingSaveRef.current=false;
        const followUp="No problem. What else should I add or change?";
        const updatedHistory=[...historyRef.current,{role:"user",text},{role:"assistant",text:followUp}];
        historyRef.current=updatedHistory;
        setConversation(updatedHistory);
        await speakReply(followUp);
        if(!voiceActiveRef.current)return;
        processingRef.current=false;
        acceptingAudioRef.current=true;
        setVoiceState("listening");
        return;
      }

      if(/^(not yet|don't save|do not save)\b/i.test(text.trim())){
        awaitingSaveRef.current=false;
        const followUp="No problem. What else should I add or change?";
        const updatedHistory=[...historyRef.current,{role:"user",text},{role:"assistant",text:followUp}];
        historyRef.current=updatedHistory;
        setConversation(updatedHistory);
        await speakReply(followUp);
        if(!voiceActiveRef.current)return;
        processingRef.current=false;
        acceptingAudioRef.current=true;
        setVoiceState("listening");
        return;
      }

      if(declinedSave){
        awaitingSaveRef.current=false;
      }
    }
    historyRef.current=nextHistory;
    setConversation(nextHistory);

    const currentLead=leadDraftRef.current;

    try{
      const res=await fetch("/api/assistant",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text,history:nextHistory.slice(-6,-1),currentLead})
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Could not understand that");

      const merged={...emptyLead,...currentLead,...(data.lead||{})};
      leadDraftRef.current=merged;
      setLead(merged);

      const reply=data.action==="create_lead"?"":(data.reply||"Got it.");
      const updatedHistory=[...nextHistory,...(reply?[{role:"assistant",text:reply}]:[])];
      historyRef.current=updatedHistory;
      setConversation(updatedHistory);

      if(data.action==="create_lead"){
        awaitingSaveRef.current=true;
        const confirmation="I have enough to create this lead. Should I save it to OVAM CRM?";
        historyRef.current=[...historyRef.current,{role:"assistant",text:confirmation}];
        setConversation(prev=>[...prev,{role:"assistant",text:confirmation}]);
        await speakReply(confirmation);
        if(!voiceActiveRef.current)return;
      }else{
        await speakReply(reply);
        if(!voiceActiveRef.current)return;
      }

      processingRef.current=false;
      if(data.action==="ask_question" && !merged.phone){
        try{voiceSession.current.socket?.send(JSON.stringify({type:"UpdateConfiguration",min_turn_silence:512,max_turn_silence:2560}))}catch{}
      }
      acceptingAudioRef.current=true;
      setVoiceState("listening");
    }catch(e){
      processingRef.current=false;
      acceptingAudioRef.current=true;
      setVoiceState("listening");
      setMessage(e.message||"I couldn't process that. Try again.");
    }
  }

  async function startVoice(){
    if(voiceState!=="idle") return;
    setMessage("");
    setInput("");
    setLead(null);
    leadDraftRef.current=emptyLead;
    historyRef.current=[];
    awaitingSaveRef.current=false;
    setConversation([]);
    processingRef.current=false;
    acceptingAudioRef.current=false;
    voiceActiveRef.current=true;
    setVoiceState("greeting");
    setMicLevel(0);

    const greeting="Hi, I'm OVAM AI. Tell me what happened with the prospect, and I'll capture the details for you.";
    historyRef.current=[{role:"assistant",text:greeting}];
    setConversation([{role:"assistant",text:greeting}]);

    // Start the greeting immediately. Voice infrastructure can initialize while OVAM speaks.
    const greetingPromise=speakReply(greeting);

    let stream=null,ctx=null,worklet=null,socket=null;
    try{
      // These independent startup steps can happen while the greeting is playing.
      const tokenPromise=fetch("/api/assemblyai-token").then(async res=>{
        const data=await res.json();
        if(!res.ok) throw new Error(data.error||"Could not start voice service");
        return data.token;
      });

      ctx=new AudioContext({sampleRate:16000});
      await ctx.resume();
      const workletPromise=ctx.audioWorklet.addModule("/pcm-processor.js");
      const streamPromise=navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}
      });

      const [token]=await Promise.all([tokenPromise,workletPromise,streamPromise.then(s=>{stream=s;})]);

      worklet=new AudioWorkletNode(ctx,"pcm-processor");
      const source=ctx.createMediaStreamSource(stream);
      source.connect(worklet);
      voiceSession.current={stream,ctx,worklet,socket:null};

      socket=new WebSocket(
        "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&speech_model=universal-3-6-pro&mode=balanced&token="+encodeURIComponent(token)
      );
      voiceSession.current.socket=socket;

      worklet.port.onmessage=e=>{
        setMicLevel(e.data.level||0);
        if(acceptingAudioRef.current&&socket.readyState===WebSocket.OPEN) socket.send(e.data.pcm);
      };

      socket.onmessage=event=>{
        const data=JSON.parse(event.data);
        if(data.type==="Turn"&&data.transcript){
          setInput(data.transcript);
          if(data.end_of_turn&&!processingRef.current) handleVoiceTurn(data.transcript);
        }
        if(data.type==="Error"){
          setMessage(data.error||"Transcription failed");
          stopVoice();
        }
      };
      socket.onerror=()=>{
        setMessage("Voice connection failed. Check your AssemblyAI configuration.");
        stopVoice();
      };
      socket.onclose=()=>setMicLevel(0);

      // Wait for AssemblyAI to actually accept the websocket before listening.
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error("Voice connection timed out. Please try again.")),7000);
        socket.addEventListener("open",()=>{
          clearTimeout(timeout);
          resolve();
        },{once:true});
        socket.addEventListener("error",()=>{
          clearTimeout(timeout);
          reject(new Error("Voice connection failed. Check your AssemblyAI configuration."));
        },{once:true});
      });

      // Don't let a slow voice greeting block readiness, but don't capture the user's
      // speech until both the greeting and AssemblyAI are ready.
      await greetingPromise;
      if(!voiceActiveRef.current)return;

      acceptingAudioRef.current=true;
      setVoiceState("listening");
    }catch(e){
      try{stream?.getTracks().forEach(t=>t.stop())}catch{}
      await ctx?.close().catch(()=>{});
      voiceSession.current={stream:null,ctx:null,worklet:null,socket:null};
      voiceActiveRef.current=false;
      acceptingAudioRef.current=false;
      try{window.speechSynthesis?.cancel()}catch{}
      setMicLevel(0);
      setVoiceState("idle");
      setMessage(e.message||"Could not start voice input");
    }
  }

  const voiceLabel=voiceState==="listening"?"Listening…":voiceState==="processing"?"Understanding…":voiceState==="greeting"?"Hello…":"Talk to OVAM AI";

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="eyebrow">OVAM REALTY</span><h1>OVAM AI</h1><p>Your real-estate assistant.</p></div>
      <div className="ai-pill"><span className="pulse-dot"></span> Gemma-powered</div>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <span className="kicker">THE OVAM AI ASSISTANT</span>
        <h2>Tell me what happened.<br/><em>I’ll handle the CRM.</em></h2>
        <p>After a call, meeting, or site visit, just tell OVAM AI what you learned about the prospect. It turns the conversation into a clean lead record.</p>
      </div>

      <div className={"voice-panel "+voiceState}>
        <button className={"voice-orb "+(voiceState==="listening"?"live":"")} onClick={voiceState==="idle"?startVoice:stopVoice} disabled={loading}>
          <span className="orb-ring ring-one"></span><span className="orb-ring ring-two"></span><span className="mic">{voiceState==="listening"?"■":"●"}</span>
        </button>
        <strong>{voiceLabel}</strong>
        {voiceState==="listening"&&<div className="live-meter"><span className="live-dot"></span><span>MIC LIVE</span><div className="meter-bars">{[1,2,3,4,5,6,7].map(i=><i key={i} style={{transform:"scaleY("+Math.max(.18,micLevel*(.55+(i%3)*.18))+")"}}/> )}</div><button className="stop-voice" onClick={stopVoice}>Stop recording</button></div>}
        {voiceState==="listening"&&input&&<div className="live-transcript">{input}</div>}
        {conversation.length>0&&<div className="voice-conversation">{conversation.map((m,i)=><div key={i} className={m.role}>{m.role==="user"?"You":"OVAM AI"}: {m.text}</div>)}</div>}
        {voiceState==="idle"&&input&&<div className="live-transcript">Review the transcript below, correct anything misheard, then click Understand this lead.</div>}
        <span>{voiceState==="listening"?"Speak naturally about the prospect.":voiceState==="processing"?"Gemma is structuring the lead.":voiceState==="greeting"?"OVAM AI is greeting you.":"Tap the microphone and tell OVAM AI what happened."}</span>
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
      <div className="lead-grid">
        {Object.entries(lead).map(([key,value])=><label key={key}><span>{fieldLabels[key]||key}</span><input value={value||""} onChange={e=>setLead({...lead,[key]:e.target.value})}/></label>)}
      </div>
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
