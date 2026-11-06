// Запуск: BOT_TOKEN=123:ABC node server.js   (Node 18+, без зависимостей)
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const PORT=process.env.PORT||3000,BOT_TOKEN=process.env.BOT_TOKEN||"";
const DB=path.join(process.env.DATA_DIR||__dirname,"players.json");
const ONLINE_MS=45000;
let P={};try{P=JSON.parse(fs.readFileSync(DB,"utf8"))}catch(e){}
let dirty=false;
setInterval(()=>{if(dirty){dirty=false;fs.writeFile(DB,JSON.stringify(P),()=>{})}},10000);
function verify(init){
  try{
    const p=new URLSearchParams(init),hash=p.get("hash");p.delete("hash");
    if(!hash)return null;
    const s=[...p.entries()].map(([k,v])=>k+"="+v).sort().join("\n");
    const key=crypto.createHmac("sha256","WebAppData").update(BOT_TOKEN).digest();
    if(crypto.createHmac("sha256",key).update(s).digest("hex")!==hash)return null;
    if(Date.now()/1000-Number(p.get("auth_date")||0)>86400*3)return null;
    return JSON.parse(p.get("user"));
  }catch(e){return null}
}
const clean=s=>String(s||"Игрок").replace(/[<>"&]/g,"").slice(0,24)||"Игрок";
function sync(b){
  let id,name=clean(b.name);
  if(BOT_TOKEN){
    const u=verify(b.initData||"");if(!u)return null;
    id="tg"+u.id;if(!b.name||b.name==="Игрок")name=clean(u.first_name);
  }else{
    id="w"+String(b.id||"").replace(/[^a-z0-9]/gi,"").slice(0,16);if(id==="w")return null;
  }
  const now=Date.now();let bal=Number(b.bal);if(!isFinite(bal)||bal<0)bal=0;
  const me=P[id]||(P[id]={bal:0,seen:now});
  // простая защита: баланс не может расти быстрее разумного темпа
  const dt=Math.max(1,(now-me.seen)/1000),max=me.bal+dt*30+400;
  me.bal=Math.min(bal,max);me.name=name;me.av=String(b.av||"").slice(0,10);me.seen=now;dirty=true;
  const all=Object.entries(P).sort((a,b)=>b[1].bal-a[1].bal);
  const rank=all.findIndex(x=>x[0]===id)+1;
  return{
    online:all.filter(x=>now-x[1].seen<ONLINE_MS).length,total:all.length,me:rank,
    top:all.slice(0,50).map(([k,v])=>({name:v.name,bal:v.bal,av:v.av,on:now-v.seen<ONLINE_MS,me:k===id}))
  };
}
http.createServer((req,res)=>{
  const h={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type"};
  if(req.method==="OPTIONS"){res.writeHead(204,h);return res.end()}
  if(req.method==="POST"&&req.url==="/api/sync"){
    let d="";req.on("data",c=>{d+=c;if(d.length>4096)req.destroy()});
    req.on("end",()=>{
      let out=null;try{out=sync(JSON.parse(d))}catch(e){}
      res.writeHead(out?200:400,{...h,"Content-Type":"application/json"});res.end(JSON.stringify(out||{error:1}));
    });return;
  }
  if(req.method==="GET"&&(req.url==="/"||req.url.startsWith("/?"))){
    res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return fs.createReadStream(path.join(__dirname,"index.html")).pipe(res);
  }
  res.writeHead(404);res.end();
}).listen(PORT,()=>console.log("http://localhost:"+PORT));
