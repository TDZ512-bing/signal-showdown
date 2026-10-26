// Run against a deployed game: node tests/public-smoke.js https://your-game.onrender.com
import assert from 'node:assert/strict';
import {io} from 'socket.io-client';
import {questions} from '../server/questions.js';
const url=process.argv[2];if(!url)throw Error('Supply the game URL.');
const states=new Map();const sockets=[];
const act=(s,type,data={})=>new Promise((resolve,reject)=>s.timeout(10000).emit('action',{type,...data},(err,result)=>err?reject(err):result.ok?resolve(result):reject(Error(result.error))));
const wait=(s,predicate,ms=45000)=>new Promise((resolve,reject)=>{if(states.has(s)&&predicate(states.get(s)))return resolve(states.get(s));const timer=setTimeout(()=>{s.off('state',listener);reject(Error('Timed out waiting for shared state'));},ms);function listener(state){if(predicate(state)){clearTimeout(timer);s.off('state',listener);resolve(state);}}s.on('state',listener);});
async function player(){const s=io(url,{forceNew:true,transports:['websocket'],reconnection:false,timeout:20000});sockets.push(s);s.on('state',state=>states.set(s,state));await new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
try{
 const health=await fetch(new URL('/health',url));assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 const a=await player(),b=await player();await act(a,'create',{name:'QA Alpha'});const lobby=await wait(a,s=>s.phase==='lobby');await act(b,'join',{name:'QA Beta',code:lobby.code});await wait(a,s=>s.players.length===2);await act(a,'start');
 for(let round=1;round<=3;round++){
  const s=await wait(a,s=>s.phase==='question'&&s.round===round);const sb=await wait(b,s=>s.phase==='question'&&s.round===round);assert.equal(s.question.id,sb.question.id);assert.equal(s.deadline,sb.deadline);assert.equal(s.question.answer,undefined);
  assert.ok(s.deadline-s.serverNow>=29900&&s.deadline-s.serverNow<=30000);
  const correct=questions.find(q=>q.id===s.question.id).answer;
  await act(a,'answer',{questionId:s.question.id,round,answer:correct});await act(b,'answer',{questionId:s.question.id,round,answer:correct*2});
  const ra=await wait(a,s=>s.phase==='reveal'&&s.round===round);const rb=await wait(b,s=>s.phase==='reveal'&&s.round===round);assert.deepEqual(ra.players,rb.players);assert.equal(ra.players[0].total,round*1000);assert.equal(ra.players[1].total,round*500);console.log(`Round ${round}: shared question, 30-second deadline, hidden answer, identical scores verified.`);
 }
 await wait(a,s=>s.phase==='finished');await wait(b,s=>s.phase==='finished');await act(a,'rematch');const rematch=await wait(b,s=>s.phase==='lobby');assert.ok(rematch.players.every(p=>p.total===0));console.log('PASS: two independent public WebSocket clients completed a match and rematch.');
}finally{sockets.forEach(s=>s.disconnect());}
