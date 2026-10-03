import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

function App(){
  const [input,setInput]=useState("");
  const [lead,setLead]=useState(null);
  const [loading,setLoading]=useState(false);
  const [list,setList]=useState(()=>JSON.parse(localStorage.getItem("ovam-leads")||"[]"));
  const [voiceState,setVoiceState]=useState("idle");
  const [micLevel,setMicLevel]=useState(0);
  const [message,setMessage]=useState("");
  const demoLead="I just spoke to Sarah. She wants a residential plot around Akobo, Ibadan. Her budget is about 10 million naira and she wants to buy within the next two months. Her phone number is 08012345678.";

  async function extractLead(text=input){
    if(!text.trim()) return;
    setLoading(true); setMessage("");
    try{
      const res=await fetch("/api/assistant",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Could not process update");
      if((data.action||"create_lead")==="no_action") throw new Error("I need a little more lead information before I can create a CRM record.");
      setLead({...emptyLead,...(data.lead||{})});
    }catch(e){setMessage(e.message||"Something went wrong")}
    finally{setLoading(false)}
  }

  function saveLead(){
    if(!lead) return;
    const next=[{...lead,id:Date.now()},...list];
    setList(next); localStorage.setItem("ovam-leads",JSON.stringify(next));
    setInput(""); setLead(null); setMessage("Lead saved to OVAM CRM.");
  }

  function startVoice(){
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){setMessage("Voice input is not supported in this browser. You can still type the lead.");return;}
    const recognition=new SpeechRecognition();
    recognition.lang="en-NG"; recognition.interimResults=false; recognition.maxAlternatives=1;
    setMessage(""); setVoiceState("listening");
    recognition.onresult=e=>{
      const text=e.results[0][0].transcript;
      setInput(text); setVoiceState("processing"); extractLead(text);
    };
    recognition.onerror=e=>{setVoiceState("idle");setMessage("Voice input stopped: "+e.error)};
    recognition.onend=()=>setVoiceState(current=>current==="listening"?"idle":current);
    recognition.start();
  }

  const voiceLabel=voiceState==="listening"?"Listening…":voiceState==="processing"?"Understanding…":"Talk to OVAM AI";

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
        <button className="voice-orb" onClick={startVoice} disabled={loading||voiceState==="listening"}>
          <span className="orb-ring ring-one"></span><span className="orb-ring ring-two"></span><span className="mic">●</span>
        </button>
        <strong>{voiceLabel}</strong>
        <span>{voiceState==="listening"?"Speak naturally about the prospect.":voiceState==="processing"?"Gemma is structuring the lead.":"Tap the microphone and tell OVAM AI what happened."}</span>
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
        {Object.entries(lead).map(([key,value])=><label key={key}><span>{key}</span><input value={value||""} onChange={e=>setLead({...lead,[key]:e.target.value})}/></label>)}
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