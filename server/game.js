import { randomInt } from 'node:crypto';
import { questions } from './questions.js';
export const score = (a,b) => Math.round(1000 * Math.min(a,b) / Math.max(a,b));
export function attachGame(io, {roundMs=30000,revealMs=12000,countdownMs=3000}={}) {
 const rooms = new Map();
 const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
 const choose = () => {
  const cats = [...new Set(questions.map(q=>q.category))];
  const picked=[];
  while(picked.length<3){const cat=cats.splice(randomInt(cats.length),1)[0];const pool=questions.filter(q=>q.category===cat);picked.push(pool[randomInt(pool.length)]);}
  return picked;
 };
 const snapshot = r => {
  const reveal=['reveal','finished'].includes(r.phase), q=r.questions[r.round];
  return {code:r.code,hostId:r.hostId,phase:r.phase,round:r.round+1,deadline:r.deadline,serverNow:Date.now(),question:q?{id:q.id,category:q.category,prompt:q.prompt,unit:q.unit,...(reveal?{answer:q.answer,explanation:q.explanation,source:q.source}:{})}:null,
   players:r.players.map(p=>({id:p.id,name:p.name,total:p.total,connected:p.connected,submitted:p.answer!==null,...(reveal?{answer:p.answer,points:p.points}:{})})),
   history:r.history};
 };
 const broadcast = r => io.to(r.code).emit('state',snapshot(r));
 const schedule=(r,ms,fn)=>{clearTimeout(r.timer);r.deadline=Date.now()+ms;r.timer=setTimeout(()=>{if(rooms.has(r.code))fn(r);},ms);};
 const closeRoom=(r,message)=>{clearTimeout(r.timer);io.to(r.code).emit('roomClosed',message);for(const p of r.players){const s=io.sockets.sockets.get(p.id);if(s){s.leave(r.code);s.data.code=null;}}rooms.delete(r.code);};
 const beginRound=r=>{r.phase='question';for(const p of r.players){p.answer=null;p.points=0;}schedule(r,roundMs,finishRound);broadcast(r);};
 const finishRound=r=>{
  if(r.phase!=='question')return;
  r.phase='reveal';const q=r.questions[r.round];
  for(const p of r.players){p.points=p.answer===null?0:score(p.answer,q.answer);p.total+=p.points;}
  r.history.push({round:r.round+1,question:q.prompt,answer:q.answer,unit:q.unit,results:r.players.map(p=>({id:p.id,name:p.name,answer:p.answer,points:p.points}))});
  schedule(r,revealMs,()=>{if(r.round===2){r.phase='finished';r.deadline=null;broadcast(r);}else{r.round++;beginRound(r);}});broadcast(r);
 };
 const everyoneDone=r=>r.players.filter(p=>p.connected).every(p=>p.answer!==null);
 const remove=socket=>{
  const r=rooms.get(socket.data.code);socket.data.code=null;if(!r)return;
  socket.leave(r.code);
  if(r.hostId===socket.id){closeRoom(r,'The host left. Create or join a new room to play again.');return;}
  if(r.phase==='lobby')r.players=r.players.filter(p=>p.id!==socket.id);
  else {const p=r.players.find(p=>p.id===socket.id);if(p)p.connected=false;}
  if(r.phase==='question'&&everyoneDone(r))finishRound(r);else broadcast(r);
 };
 io.on('connection',socket=>{
  let count=0,windowStart=Date.now();
  socket.on('action',(msg,ack)=>{
   if(typeof ack!=='function')return;
   try{
    if(Date.now()-windowStart>10000){count=0;windowStart=Date.now();}
    if(++count>30)throw Error('Too many actions. Wait a few seconds and try again.');
    if(!msg||typeof msg!=='object')throw Error('Invalid request.');
    const {type}=msg;
    if(type==='leave'){remove(socket);ack({ok:true});return;}
    if(type==='create'||type==='join'){
     if(socket.data.code)throw Error('Leave your current room first.');
     const name=typeof msg.name==='string'?msg.name.trim():'';
     if(!name||name.length>20||/[\x00-\x1f]/.test(name))throw Error('Use a nickname of 1–20 characters.');
     let r;
     if(type==='create'){
      if(rooms.size>=500)throw Error('The server is full. Please try again shortly.');
      let code;do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(rooms.has(code));
      r={code,hostId:socket.id,phase:'lobby',round:-1,deadline:null,players:[],questions:[],history:[],timer:null,created:Date.now()};rooms.set(code,r);
     }else{
      const code=typeof msg.code==='string'?msg.code.trim().toUpperCase():'';r=rooms.get(code);
      if(!r)throw Error('Room not found. Check the six-character code.');
      if(r.phase!=='lobby')throw Error('This match has started. Join when the host returns to the lobby.');
      if(r.players.length>=8)throw Error('This room is full (8 players).');
      if(r.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw Error('That nickname is taken in this room. Try another.');
     }
     r.players.push({id:socket.id,name,total:0,answer:null,points:0,connected:true});socket.data.code=r.code;socket.join(r.code);broadcast(r);ack({ok:true});return;
    }
    const r=rooms.get(socket.data.code);if(!r)throw Error('Join a room first.');
    if(type==='start'){
     if(r.hostId!==socket.id)throw Error('Only the host can start.');
     if(r.phase!=='lobby')throw Error('The match is already underway.');
     if(r.players.length<2)throw Error('Invite at least one more player.');
     r.questions=choose();r.round=0;r.history=[];r.phase='countdown';
     schedule(r,countdownMs,beginRound);broadcast(r);
    }else if(type==='answer'){
     if(r.phase!=='question'||Date.now()>=r.deadline)throw Error('The answering window has closed.');
     if(msg.questionId!==r.questions[r.round].id||msg.round!==r.round+1)throw Error('That answer belongs to a previous round.');
     const p=r.players.find(p=>p.id===socket.id);if(p.answer!==null)throw Error('Your answer is already locked.');
     if(typeof msg.answer!=='number'||!Number.isFinite(msg.answer)||msg.answer<=0||msg.answer>1e30)throw Error('Enter a positive number no larger than 1e30.');
     p.answer=msg.answer;if(everyoneDone(r))finishRound(r);else broadcast(r);
    }else if(type==='rematch'){
     if(r.hostId!==socket.id)throw Error('Only the host can return to the lobby.');
     if(r.phase!=='finished')throw Error('Finish this match first.');
     r.players=r.players.filter(p=>p.connected);for(const p of r.players){p.total=0;p.points=0;p.answer=null;}
     r.phase='lobby';r.round=-1;r.questions=[];r.history=[];r.deadline=null;broadcast(r);
    }else throw Error('Unknown action.');
    ack({ok:true});
   }catch(e){ack({ok:false,error:e.message});}
  });
  socket.on('disconnect',()=>remove(socket));
 });
 const cleanup=setInterval(()=>{for(const r of rooms.values()){if(Date.now()-r.created>2*60*60*1000)closeRoom(r,'This room expired after two hours. Create a fresh room to continue.');}},60000);cleanup.unref();
 return {rooms,dispose(){clearInterval(cleanup);for(const r of rooms.values())clearTimeout(r.timer);}};
}
