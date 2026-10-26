import test from 'node:test';
import assert from 'node:assert/strict';
import {io as client} from 'socket.io-client';
import {createApp} from '../server/index.js';
import {score} from '../server/game.js';
import {questions} from '../server/questions.js';
const wait=(c,check,timeout=3000)=>new Promise((resolve,reject)=>{
 if(c.last&&check(c.last))return resolve(c.last);
 const timer=setTimeout(()=>{c.off('state',listener);reject(Error('Timed out waiting for game state'));},timeout);
 function listener(s){if(check(s)){clearTimeout(timer);c.off('state',listener);resolve(s);}}c.on('state',listener);
});
const action=(c,type,data={})=>new Promise((resolve,reject)=>c.timeout(2000).emit('action',{type,...data},(err,res)=>err?reject(err):resolve(res)));
async function setup(t,options={}){
 const app=createApp({roundMs:1000,revealMs:60,countdownMs:30,...options});await new Promise(r=>app.http.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${app.http.address().port}`;const clients=[];
 t.after(async()=>{clients.forEach(c=>c.disconnect());await app.close();});
 async function connect(){const c=client(url,{forceNew:true,transports:['websocket'],reconnection:false});clients.push(c);c.on('state',s=>c.last=s);await new Promise((res,rej)=>{c.once('connect',res);c.once('connect_error',rej);});return c;}
 const a=await connect(),b=await connect();assert.equal((await action(a,'create',{name:'Ada'})).ok,true);const code=a.last.code;assert.match(code,/^[A-Z2-9]{6}$/);assert.equal((await action(b,'join',{name:'Nova',code})).ok,true);await wait(a,s=>s.players.length===2);return {app,a,b,code,connect,url};
}
test('scoring is symmetric and exact',()=>{assert.equal(score(100,100),1000);assert.equal(score(50,100),500);assert.equal(score(200,100),500);assert.equal(score(10,100),100);});
test('12 positive sourced questions and independently checked calculations',()=>{
 assert.equal(questions.length,12);assert.equal(new Set(questions.map(q=>q.id)).size,12);for(const q of questions){assert.ok(q.answer>0&&Number.isFinite(q.answer));assert.ok(q.source.startsWith('https://'));}
 const q=id=>questions.find(q=>q.id===id).answer;assert.equal(q('image'),1000*1000*3);assert.equal(q('values'),2**16);assert.equal(q('dataset'),250000*20*8/1e6);assert.ok(Math.abs(q('fiber')-5.0034614)<1e-6);
});
test('two independent clients complete three rounds, identical results, and rematch',async t=>{
 const {a,b}=await setup(t);
 assert.equal((await action(b,'start')).ok,false);
 assert.equal((await action(a,'start')).ok,true);
 const categories=new Set();
 for(let round=1;round<=3;round++){
  const s=await wait(a,s=>s.phase==='question'&&s.round===round);const other=await wait(b,x=>x.phase==='question'&&x.round===round);assert.equal(s.deadline,other.deadline);assert.equal(s.question.answer,undefined);assert.equal(s.question.source,undefined);categories.add(s.question.category);
  const answer=questions.find(q=>q.id===s.question.id).answer;
  assert.equal((await action(a,'answer',{questionId:s.question.id,round,answer})).ok,true);
  await wait(b,x=>x.players.find(p=>p.id===a.id).submitted);assert.equal(b.last.players.find(p=>p.id===a.id).answer,undefined);
  assert.equal((await action(a,'answer',{questionId:s.question.id,round,answer})).ok,false);
  assert.equal((await action(b,'answer',{questionId:s.question.id,round,answer:answer*2})).ok,true);
  const ra=await wait(a,x=>x.phase==='reveal'&&x.round===round);const rb=await wait(b,x=>x.phase==='reveal'&&x.round===round);
  assert.deepEqual(ra.players,rb.players);assert.equal(ra.players[0].total,1000*round);assert.equal(ra.players[1].total,500*round);
 }
 assert.equal(categories.size,3);await wait(a,s=>s.phase==='finished');await wait(b,s=>s.phase==='finished');assert.equal(a.last.history.length,3);
 assert.equal((await action(b,'rematch')).ok,false);assert.equal((await action(a,'rematch')).ok,true);await wait(b,s=>s.phase==='lobby');assert.ok(b.last.players.every(p=>p.total===0));
});
test('deadline, invalid input, stale round and late join are enforced',async t=>{
 const {a,b,connect,code}=await setup(t,{roundMs:200,revealMs:300});await action(a,'start');const s=await wait(a,s=>s.phase==='question');
 for(const answer of [0,-1,null,'100',1e31])assert.equal((await action(a,'answer',{questionId:s.question.id,round:1,answer})).ok,false);
 assert.equal((await action(a,'answer',{questionId:s.question.id,round:3,answer:10})).ok,false);
 const c=await connect();assert.equal((await action(c,'join',{name:'Late',code})).ok,false);
 const r=await wait(b,s=>s.phase==='reveal');assert.ok(r.players.every(p=>p.points===0));assert.equal((await action(a,'answer',{questionId:s.question.id,round:1,answer:10})).ok,false);
});
test('host departure closes room and room isolation holds',async t=>{
 const {a,b,connect}=await setup(t);const c=await connect();await action(c,'create',{name:'Other room'});const code=c.last.code;
 const closed=new Promise(r=>b.once('roomClosed',r));a.disconnect();assert.match(await closed,/host left/i);assert.equal(c.last.code,code);assert.equal(c.last.players.length,1);assert.equal((await action(b,'create',{name:'New host'})).ok,true);
});
test('room capacity, nickname validation and duplicate names',async t=>{
 const {a,code,connect}=await setup(t);
 const c=await connect();assert.equal((await action(c,'join',{name:'Ada',code})).ok,false);assert.equal((await action(c,'join',{name:'',code})).ok,false);
 for(let i=2;i<8;i++){const p=await connect();assert.equal((await action(p,'join',{name:`Player ${i}`,code})).ok,true);}
 await wait(a,s=>s.players.length===8);assert.equal((await action(c,'join',{name:'Ninth',code})).ok,false);
});
