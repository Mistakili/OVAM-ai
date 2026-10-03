const key=process.env.ASSEMBLYAI_API_KEY;
if(!key) throw new Error("ASSEMBLYAI_API_KEY is missing");

const tools=[
  {type:"function",name:"update_lead",description:"Update the current OVAM CRM lead draft with only facts explicitly provided by the realtor. Never invent values and never save the lead.",parameters:{type:"object",properties:{
    name:{type:"string"},phone:{type:"string",description:"Phone number exactly as spoken, preserving leading zeroes."},email:{type:"string"},property:{type:"string"},location:{type:"string"},budget:{type:"string"},dealPrice:{type:"string"},deposit:{type:"string"},paymentPlan:{type:"string"},paymentFrequency:{type:"string"},amountPaid:{type:"string"},balance:{type:"string"},timeline:{type:"string"},nextFollowUp:{type:"string"},nextAction:{type:"string"},status:{type:"string"},source:{type:"string"},preferredContact:{type:"string"},objections:{type:"string"},notes:{type:"string"}
  }}},
  {type:"function",name:"save_lead",description:"Save the current lead to OVAM CRM. ONLY call this after the realtor explicitly confirms they want the lead saved.",parameters:{type:"object",properties:{}}}
];

const system_prompt=`You are OVAM AI, a warm and concise voice CRM assistant for OVAM Realty in Nigeria.

Listen naturally to a realtor describing what happened with a prospect and keep the CRM draft accurate.

- Let the realtor tell the story in any order. Capture every relevant fact from a single utterance.
- Never invent a name, phone, email, money amount, date, location, property or other fact.
- Use update_lead whenever the realtor gives a new or corrected CRM fact.
- Never ask for a detail that was already provided.
- A useful normal lead needs at least name + phone + one meaningful property, location, budget or timeline detail.
- Once that minimum is present, briefly summarize and ask whether the realtor wants it saved. Do NOT call save_lead yet.
- If the realtor says no but says they have more information, say "No problem. What else should I add?" and keep listening. Do not repeat the save question.
- If the realtor gives more information after a save question, update the draft and continue.
- Only call save_lead after an explicit confirmation such as yes, save it, go ahead, do it or please save.
- After save_lead succeeds, tell the realtor it is saved.
- Keep spoken replies to one or two short sentences.
- Resolve pronouns such as she, he, her number from the current conversation.
- Phone numbers and emails are important entities; do not interrupt halfway through them.
- Useful Nigerian real-estate vocabulary includes OVAM Realty, Ibadan, Akobo, Bodija, Jericho, Ring Road, Monatan, Iwo Road, plots, land, naira, WhatsApp and Instagram.

Greeting: "Hi, I'm OVAM AI. Tell me what happened with the prospect, and I'll capture the details for you."`;

const body={
  name:"OVAM AI",
  system_prompt,
  greeting:"Hi, I'm OVAM AI. Tell me what happened with the prospect, and I'll capture the details for you.",
  voice:{voice_id:"ivy"},
  llm:{base_url:"https://llm-gateway.assemblyai.com/v1",model:"gemma-4-31b",api_key:key},
  tools,
  input:{mode:"balanced",keyterms:["OVAM Realty","OVAM AI","Ibadan","Akobo","Akobo estate","Bodija","Jericho","Ring Road","Monatan","Iwo Road","Naira","WhatsApp","Instagram"]}
};

const r=await fetch("https://agents.assemblyai.com/v1/agents",{method:"POST",headers:{Authorization:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
const data=await r.json();
if(!r.ok) throw new Error(JSON.stringify(data));
console.log("OVAM AI agent created.");
console.log("Agent ID:",data.id||data.agent_id);