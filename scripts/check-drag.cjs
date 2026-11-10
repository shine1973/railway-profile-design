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
 const drag=async(a,b,cancel=false,during=null)=>{
 w.webContents.sendInputEvent({type:'mouseMove',...a});w.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...a});
 w.webContents.sendInputEvent({type:'mouseMove',...b});await delay();
 if(during)await during();
 if(cancel){w.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});w.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});}
 w.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...b});await delay();
 };
 const snapshot=()=>js(`({path:document.querySelector('#chart path[stroke="#df9e3d"]').getAttribute('d'),rows:document.getElementById('rows').textContent,stats:document.querySelector('.stats').textContent})`);
 const initial=await snapshot();
 await drag(await point(0,true),await point(4),false,async()=>{
   assert.deepEqual(await selected(),['p5','p20']);
   const live=await snapshot();assert.notEqual(live.path,initial.path);assert.notEqual(live.rows,initial.rows);assert.notEqual(live.stats,initial.stats);
 });
 assert.deepEqual(await selected(),['p5','p20']);
 assert.equal(await js(`document.querySelector('[data-lift="p5"]').value`),'10');
 await js(`document.getElementById('undo').click()`);assert.deepEqual(await selected(),['p1','p20']);
 await js(`document.getElementById('redo').click()`);assert.deepEqual(await selected(),['p5','p20']);
 await drag(await point(0,true),await point(19));assert.deepEqual(await selected(),['p5','p20']);
 const beforeCancel=await snapshot();
 await drag(await point(0,true),await point(8),true,async()=>{assert.notDeepEqual(await snapshot(),beforeCancel);});assert.deepEqual(await selected(),['p5','p20']);assert.deepEqual(await snapshot(),beforeCancel);
 await drag(await point(0,true),await point(2));assert.deepEqual(await selected(),['p3','p20']);
 await js(`document.getElementById('chart').dispatchEvent(new WheelEvent('wheel',{deltaY:-350,clientX:500,clientY:300,bubbles:true,cancelable:true}))`);await delay();
 const before=await point(0);
 const blank=await js(`(()=>{const r=document.getElementById('chart').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+3)}})()`);
 await drag(blank,{x:blank.x-70,y:blank.y});assert.deepEqual(await selected(),['p3','p20']);assert.notEqual((await point(0)).x,before.x);
 await js(`document.getElementById('clear').click();document.getElementById('fit').click();document.querySelector('[data-select="p1"]').click();document.querySelector('[data-select="p2"]').click();document.querySelector('[data-select="p3"]').click();`);
 assert.equal(await js(`document.querySelector('[data-row="p3"]').children[8].textContent`),'未设计');
 await js(`document.querySelector('[data-select="p4"]').click()`);
 assert.equal(await js(`document.querySelectorAll('[data-segment]').length`),2);
 assert.equal(await js(`(document.querySelector('#chart path[stroke="#df9e3d"]').getAttribute('d').match(/M/g)||[]).length`),2);
 assert.equal(await js(`document.querySelector('[data-row="p2"]').children[9].textContent`),'');
 await js(`document.querySelector('[data-select="p10"]').click();document.querySelector('[data-select="p15"]').click()`);
 assert.equal(await js(`document.querySelector('[data-row="p7"]').children[8].textContent`),'未设计');
 await js(`document.querySelector('[data-segment="1"]').click()`);
 assert.deepEqual(await selected(),['p1','p2','p10','p15']);
 await js(`document.querySelector('[data-select="p8"]').click();document.getElementById('cancelPending').click()`);
 assert.deepEqual(await selected(),['p1','p2','p10','p15']);
 const positions=()=>js(`(()=>{const r=document.getElementById('chart').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,tableTop:document.querySelector('.tablecard').getBoundingClientRect().top,toolbarHeight:document.querySelector('.zoomtools').getBoundingClientRect().height,scrollY:window.scrollY,details:Array.from(document.querySelectorAll('.workspace,.chartcard,.chartfoot,aside,#controls,.controltools,.sectionhead')).map(e=>[e.className||e.id,e.getBoundingClientRect().height])}})()`);
 const beforeSelection=await positions();
 await js(`document.querySelector('[data-select="p2"]').click()`);
 assert.deepEqual(await positions(),beforeSelection);

 assert.equal(await js(`document.querySelector('#chart [data-pending]').getAttribute('data-pending')`),'p2');
 assert.equal(await js(`document.getElementById('selectionHint').hidden`),false);
 assert.match(await js(`document.getElementById('selectionHint').textContent`),/记录序号 2/);
 assert.equal(await js(`document.querySelector('[data-row="p2"]').classList.contains('pendingrow')`),true);
 assert.equal(await js(`document.querySelector('[data-lift="p2"]').closest('.controlitem').classList.contains('pendingcontrol')`),true);
 await js(`document.getElementById('cancelPending').click()`);
 assert.equal(await js(`document.querySelector('#chart [data-pending]')===null`),true);
 assert.deepEqual(await selected(),['p1','p2','p10','p15']);
 await js(`document.querySelector('[data-select="p2"]').click();document.querySelector('[data-select="p4"]').click()`);
 assert.equal(await js(`document.querySelector('#chart [data-pending]')===null`),true);
 assert.equal(await js(`document.getElementById('selectionHint').hidden`),true);
 assert.deepEqual(await positions(),beforeSelection);
 assert.equal(await js(`document.querySelectorAll('[data-segment]').length`),3);
 w.setSize(1000,960);await delay();
 const compact=await positions();
 await js(`document.querySelector('[data-select="p4"]').click()`);assert.deepEqual(await positions(),compact);
 await js(`document.getElementById('cancelPending').click()`);assert.deepEqual(await positions(),compact);
 console.log('PASS: forward/backward drag, retained lift, undo/redo, occupied target, Escape cancellation, independent pairs, adjacent gaps, segment removal, shared endpoint selection highlight, stable layout at 1440/1000 widths');
 app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
