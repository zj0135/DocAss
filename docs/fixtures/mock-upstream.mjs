import http from 'node:http';
// No real credentials. The redirect target records only whether a credential header leaked.
const server=http.createServer((req,res)=>{
 if(req.url==='/redirect'){res.writeHead(302,{Location:'/leak'});res.end();return;}
 if(req.url==='/leak'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({credentialLeaked:!!(req.headers.authorization||req.headers['x-api-key'])}));return;}
 if(req.url!=='/stream'||req.method!=='POST'){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});let i=0;
 const timer=setInterval(()=>{res.write(`data: ${JSON.stringify({text:`part-${++i}`})}\n\n`);if(i===4){clearInterval(timer);res.end('data: [DONE]\n\n');}},250);
 res.on('close',()=>clearInterval(timer));
});
server.listen(Number(process.env.DOCASS_FIXTURE_PORT??0),'127.0.0.1',()=>console.log(JSON.stringify({origin:`http://127.0.0.1:${server.address().port}`})));
