const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const delay=()=>new Promise(r=>setTimeout(r,80));
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true}});
 try{
 await w.loadFile(process.cwd()+'/src/index.html');
 const js=code=>w.webContents.executeJavaScript(code);
 await js(`document.getElementById('demo').click()`);await delay();
 await js(`document.querySelector('[data-select="p1"]').click();document.querySelector('[data-select="p20"]').click();var lift=document.querySelector('[data-lift="p1"]');lift.value='10';lift.dispatchEvent(new Event('change'));`);await delay();
 const selected=()=>js(`Array.from(document.querySelectorAll('[data-select]:checked')).map(x=>x.dataset.select)`);
 const point=async(n,control=false)=>js(`(()=>{const svg=document.getElementById('chart'),r=svg.getBoundingClientRect(),c=svg.querySelectorAll('circle[r="${control?6:3}"]')[${n}];return {x:Math.round(r.left+Number(c.getAttribute('cx'))),y:Math.round(r.top+Number(c.getAttribute('cy')))};})()`);
 const drag=async(a,b,cancel=false)=>{
 w.webContents.sendInputEvent({type:'mouseMove',...a});w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...a});
 w.webContents.sendInputEvent({type:'mouseMove',...b});await delay();
 if(cancel){w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
 w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...b});await delay();
 };
 await drag(await point(0,true),await point(4));
 assert.deepEqual(await selected(),['p5','p20']);
 assert.equal(await js(`document.querySelector('[data-lift="p5"]').value`),'10');
 await js(`document.getElementById('undo').click()`);assert.deepEqual(await selected(),['p1','p20']);
 await js(`document.getElementById('redo').click()`);assert.deepEqual(await selected(),['p5','p20']);
 await drag(await point(0,true),await point(19));assert.deepEqual(await selected(),['p5','p20']);
 await drag(await point(0,true),await point(8),true);assert.deepEqual(await selected(),['p5','p20']);
 await drag(await point(0,true),await point(2));assert.deepEqual(await selected(),['p3','p20']);
 await js(`document.getElementById('chart').dispatchEvent(new WheelEvent('wheel',{deltaY:-350,clientX:500,clientY:300,bubbles:true,cancelable:true}))`);await delay();
 const before=await point(0);
 const blank=await js(`(()=>{const r=document.getElementById('chart').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+3)}})()`);
 await drag(blank,{x:blank.x-70,y:blank.y});assert.deepEqual(await selected(),['p3','p20']);assert.notEqual((await point(0)).x,before.x);
 console.log('PASS: forward/backward drag, retained lift, undo/redo, occupied target, Escape cancellation');
 app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
