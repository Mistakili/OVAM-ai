import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import "./styles.css";

const emptyLead={name:"",phone:"",property:"",location:"",budget:"",timeline:"",status:"New",notes:""};

function App(){
  const [input,setInput]=useState("");
  const [lead,setLead]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [list,setList]=useState(()=>JSON.parse(localStorage.getItem("ovam-leads")||"[]"));

  async function extractLead(){
    if(!input.trim()) return;
    setLoading(true); setError("");
    try{
      const res=await fetch("/api/extract-lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:input})});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error||"Could not extract lead");
      setLead({...emptyLead,...data.lead});
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  }

  function saveLead(){
    if(!lead) return;
    const next=[{...lead,id:Date.now()},...list];
    setList(next); localStorage.setItem("ovam-leads",JSON.stringify(next));
    setInput(""); setLead(null);
  }

  function startVoice(){
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){setError("Voice input is not supported in this browser. You can still type the lead.");return;}
    const recognition=new SpeechRecognition();
    recognition.lang="en-NG"; recognition.interimResults=false; recognition.maxAlternatives=1;
    setError("");
    recognition.onstart=()=>setError("Listening… speak naturally about the lead.");
    recognition.onresult=e=>{setInput(e.results[0][0].transcript);setError("")};
    recognition.onerror=e=>setError("Voice input stopped: "+e.error);
    recognition.start();
  }

  return <main className="shell">
    <header>
      <div><span className="eyebrow">OVAM REALTY</span><h1>OVAM AI</h1><p>Your voice-first lead assistant.</p></div>
      <div className="badge">Gemma core</div>
    </header>

    <section className="capture card">
      <div className="section-title"><span>01</span><div><h2>Tell OVAM AI about a lead</h2><p>For now, type exactly what you would say aloud. Voice comes next.</p></div></div>
      <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Example: I just spoke to Sarah. She wants land around Akobo, Ibadan. Her budget is about 10 million and she wants to buy within two months." />
      <div className="actions"><button className="voice" onClick={startVoice}>🎙 Speak lead</button><button onClick={extractLead} disabled={loading||!input.trim()}>{loading?"Extracting…":"Extract lead"}</button></div>
      {error&&<div className="error">{error}</div>}
    </section>

    {lead&&<section className="card result">
      <div className="section-title"><span>02</span><div><h2>Lead found</h2><p>Review the information before saving it.</p></div></div>
      <div className="grid">{Object.entries(lead).map(([key,value])=><label key={key}><span>{key}</span><input value={value||""} onChange={e=>setLead({...lead,[key]:e.target.value})}/></label>)}</div>
      <button onClick={saveLead}>Save to CRM</button>
    </section>}

    <section className="card">
      <div className="section-title"><span>03</span><div><h2>OVAM leads</h2><p>{list.length} lead{list.length===1?"":"s"} in this demo.</p></div></div>
      {!list.length?<div className="empty">No leads saved yet.</div>:<div className="leads">{list.map(x=><article key={x.id}><strong>{x.name||"Unnamed lead"}</strong><span>{x.property||"Property"} · {x.location||"Location"}</span><small>{x.budget||"Budget not captured"} · {x.timeline||"Timeline not captured"}</small></article>)}</div>}
    </section>
  </main>
}
createRoot(document.getElementById("root")).render(<App/>);