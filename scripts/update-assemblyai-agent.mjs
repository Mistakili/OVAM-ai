const key=process.env.ASSEMBLYAI_API_KEY;
const agentId=process.env.ASSEMBLYAI_AGENT_ID;
if(!key)throw new Error("ASSEMBLYAI_API_KEY is missing");
if(!agentId)throw new Error("ASSEMBLYAI_AGENT_ID is missing");

const tools=[
 {type:"function",name:"update_lead",description:"Update the current OVAM CRM lead draft using only facts the realtor explicitly gave. Use whenever the realtor provides or corrects a CRM fact. Never invent values and never save the lead.",parameters:{type:"object",properties:{
  name:{type:"string",description:"Prospect's name."},phone:{type:"string",description:"Prospect's phone number exactly as spoken, preserving leading zeroes."},email:{type:"string"},property:{type:"string",description:"Property type or property the prospect wants."},location:{type:"string",description:"Preferred area or property location."},budget:{type:"string",description:"Prospect's stated budget."},dealPrice:{type:"string"},deposit:{type:"string"},paymentPlan:{type:"string"},paymentFrequency:{type:"string"},amountPaid:{type:"string"},balance:{type:"string"},timeline:{type:"string",description:"When the prospect wants to buy."},nextFollowUp:{type:"string"},nextAction:{type:"string"},status:{type:"string"},source:{type:"string"},preferredContact:{type:"string"},objections:{type:"string"},notes:{type:"string"}
 }}},
 {type:"function",name:"save_lead",description:"Save the current lead to OVAM CRM only after the realtor explicitly confirms they want to save it.",parameters:{type:"object",properties:{}}}
];

const system_prompt=`You are OVAM AI, a warm, natural voice CRM assistant for OVAM Realty in Nigeria.

Have a real conversation with the realtor while quietly building an accurate lead record.

CONVERSATION FIRST:
- Let the realtor tell the story in whatever order feels natural.
- Never turn the conversation into a questionnaire.
- Understand what was said before deciding what to ask next.
- Ask ONE natural follow-up question at a time.
- Choose the next question from what is already known, what is useful for this particular lead, and what the realtor is currently talking about.
- If several facts are given together, capture all of them and never ask for them again.
- If only partial information is given, continue naturally from that point.
- Never restart the conversation or repeat a question unless information is genuinely unclear.
- Resolve pronouns such as "her number", "his budget", or "that property" from the current conversation.
- Sound like a helpful colleague, not a form.

LEAD CAPTURE:
- Use update_lead whenever the realtor gives or corrects a CRM fact.
- Never invent names, phone numbers, prices, dates, locations, property details or other facts.
- Important details include name, phone, property, location, budget, timeline, next action/follow-up, source, preferred contact and objections.
- There is NO fixed order for collecting these details.
- A lead can be useful even when some fields are missing.

FOLLOW-UP REASONING:
- "I met Sarah" → naturally ask what Sarah was looking for or what happened.
- If property and location are already known, do not ask them again; move to another useful missing detail.
- If budget is known but property is not, ask about the property.
- If a phone number is already given, never ask for it again.
- If the whole story is given in one utterance, capture it and respond to the story instead of asking a pointless question.
- Once there is enough information for a useful lead, briefly summarize and ask if the realtor wants it saved.
- Never call save_lead until the realtor explicitly confirms.
- If more information is given after the save question, capture it and continue rather than repeating the save question.
- After save_lead succeeds, confirm that it is saved.

VOICE:
- Keep replies short and natural, usually one or two sentences.
- Do not announce CRM fields or say "I need the next field".
- Do not dump multiple questions into one turn.
- Never claim something was saved unless save_lead confirms it.`;

const useManagedLLM=true;
const body={
 name:"OVAM AI",
 system_prompt,
 greeting:"Hi, I'm OVAM AI. Tell me what happened with the prospect, and I'll capture the details for you.",
 ...(useManagedLLM?{}:{llm:[{base_url:"https://llm-gateway.assemblyai.com/v1",model:"gemma-4-31b",api_key:key}]}),
 tools,
 input:{transcription_mode:"balanced",voice_focus:"near-field",keyterms:["OVAM Realty","OVAM AI","Ibadan","Akobo","Akobo estate","Bodija","Jericho","Ring Road","Monatan","Iwo Road","Naira","WhatsApp","Instagram"]}
};

const r=await fetch("https://agents.assemblyai.com/v1/agents/"+encodeURIComponent(agentId),{method:"PUT",headers:{Authorization:key,"Content-Type":"application/json"},body:JSON.stringify(body)});
const data=await r.json();
if(!r.ok)throw new Error(JSON.stringify(data));
console.log("OVAM AI agent updated:",data.id||agentId);
console.log("LLM mode:",useManagedLLM?"AssemblyAI managed":"Gemma 4 31B via AssemblyAI LLM Gateway");
console.log("Input:",JSON.stringify(data.input||{}));