import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {attachGame} from './game.js';
export function createApp(options={}){
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next();});
 app.get('/health',(_req,res)=>res.json({ok:true,game:'Signal Showdown'}));
 const dist=fileURLToPath(new URL('../dist',import.meta.url));app.use(express.static(dist));
 app.get('/',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
 const http=createServer(app);const io=new Server(http,{maxHttpBufferSize:8192,pingTimeout:15000});
 const game=attachGame(io,options);
 return {http,io,game,close:()=>new Promise(resolve=>{game.dispose();io.close(()=>http.close(()=>resolve()));})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp();const port=Number(process.env.PORT)||3000;
 app.http.listen(port,'0.0.0.0',()=>console.log(`Signal Showdown is ready at http://localhost:${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{app.close().then(()=>process.exit(0));});
}
