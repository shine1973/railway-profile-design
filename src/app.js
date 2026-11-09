import {newProject,calculate,integer,format,History} from './core.js';
const $=id=>document.getElementById(id), api=window.desktop;
let history=new History(newProject()), saved=JSON.stringify(history.current), results=[], view=null, pan=null, busy=false;
const project=()=>history.current;
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function status(text){$('status').textContent=text;}
function message(text,title='请检查'){ $('messageTitle').textContent=title;$('messageText').textContent=text;$('message').showModal(); }
$('messageClose').onclick=()=>$('message').close();
function dirty(){return JSON.stringify(project())!==saved;}
function mutate(fn){const p=structuredClone(project());fn(p);history.change(p);render();}
async function replaceAllowed(){
  if(!dirty())return true;
  return new Promise(resolve=>{const d=$('confirm');d.showModal();$('cancelReplace').onclick=()=>{d.close();resolve(false);};$('acceptReplace').onclick=()=>{d.close();resolve(true);};d.oncancel=()=>resolve(false);});
}
async function action(fn){if(busy)return;busy=true;try{await fn();}catch(e){message(e.message);}finally{busy=false;render();}}
async function request(method,...args){if(!api)throw new Error('请在桌面应用中使用此功能');const r=await api[method](...args);if(!r.ok)throw new Error(r.error);return r.value;}
$('import').onclick=()=>action(async()=>{
  if(!await replaceAllowed())return;
  const p=await request('importExcel');if(!p)return;
  history=new History(p);saved='';view=null;status(`已导入 ${p.points.length} 个测点，请在图中或表格中选择控制点。`);
});
$('open').onclick=()=>action(async()=>{
  if(!await replaceAllowed())return;
  const r=await request('openProject');if(!r)return;
  history=new History(r.project);saved=JSON.stringify(project());view=null;status(`已打开：${r.file}`);
});
$('save').onclick=()=>action(async()=>{const snapshot=structuredClone(project());const file=await request('saveProject',snapshot);if(file){saved=JSON.stringify(snapshot);status(`已保存：${file}`);}});
$('export').onclick=()=>action(async()=>{const file=await request('exportExcel',project());if(file)status(`已导出可编辑图表及成果：${file}`);});
$('demo').onclick=()=>action(async()=>{
  if(!await replaceAllowed())return;
  const points=Array.from({length:45},(_,i)=>({id:`p${i+1}`,sourceRow:i+2,feature:i===0?'起点':i===17?'道岔尖轨':i===44?'终点':'',no:i-2,fore:1200+Math.round(i*3+32*Math.sin(i/5)),back:null}));
  history=new History(newProject(points,'演示项目（非现场数据）'));saved='';view=null;status('演示数据已载入。点击两个测点开始拉坡。');
});
$('projectName').onchange=e=>mutate(p=>{p.name=e.target.value.trim()||'未命名项目';});
$('sleepers').onchange=e=>{try{const n=integer(e.target.value,'轨枕根数');if(n<1||n>1000)throw new Error('轨枕根数须在 1 至 1000 之间');view=null;mutate(p=>p.sleepers=n);}catch(err){message(err.message);e.target.value=project().sleepers;}};
$('undo').onclick=()=>{history.undo();render();};$('redo').onclick=()=>{history.redo();render();};
$('clear').onclick=()=>mutate(p=>p.controls={});
$('fit').onclick=()=>{view=null;drawChart();};
['labelNo','labelFeature','labelLift'].forEach(id=>$(id).onchange=drawChart);
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?history.redo():history.undo();render();}if(e.key.toLowerCase()==='s'){e.preventDefault();$('save').click();}}});
function toggle(id){mutate(p=>{if(Object.hasOwn(p.controls,id))delete p.controls[id];else p.controls[id]=0;});}
function render(){
  results=calculate(project());
  $('projectName').value=project().name;$('sleepers').value=project().sleepers;$('spacing').textContent=(project().sleepers*.6).toFixed(1)+' m';
  const selected=Object.keys(project().controls), designed=results.filter(r=>r.design!==null), negative=designed.filter(r=>r.lift<0);
  $('pointCount').textContent=results.length||'—';$('controlCount').textContent=selected.length;$('controlBadge').textContent=selected.length;
  $('designedCount').textContent=designed.length;$('maxLift').textContent=designed.length?format(Math.max(...designed.map(r=>r.lift))):'—';
  $('negativeCount').textContent=negative.length;$('negativeCount').classList.toggle('negative',negative.length>0);
  $('saveState').textContent=dirty()?'● 未保存':results.length?'已保存':'尚未导入';
  api?.setDirty(dirty());
  $('save').disabled=busy||!results.length;$('export').disabled=busy||!results.length;$('import').disabled=busy;$('open').disabled=busy;
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;$('clear').disabled=!selected.length;
  $('empty').hidden=results.length>0;
  $('controls').innerHTML=results.filter(r=>selected.includes(r.id)).map(r=>`<div class="controlitem"><div class="top"><span>点号 ${r.no}${r.no!==r.index+1?` <small> / 序号 ${r.index+1}</small>`:''}</span><button data-remove="${r.id}" aria-label="取消控制点 ${r.no}">×</button></div><label>起道量 <input type="text" inputmode="numeric" aria-label="控制点 ${r.no} 起道量" data-lift="${r.id}" value="${project().controls[r.id]}" class="${project().controls[r.id]<0?'negative':''}"> mm</label></div>`).join('') || '<p class="hint">尚未选择控制点。<br>选择两个或更多测点后生成设计线。</p>';
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>toggle(b.dataset.remove));
  document.querySelectorAll('[data-lift]').forEach(input=>{
    input.onchange=()=>{try{const value=integer(input.value,'起道量');mutate(p=>p.controls[input.dataset.lift]=value);}catch(e){invalid(input,e.message);}};
    input.onkeydown=e=>{if(e.key==='Enter'){input.blur();}if(e.key==='Escape'){input.value=project().controls[input.dataset.lift];clearInvalid(input);input.blur();}};
  });
  $('rows').innerHTML=results.map(r=>`<tr data-row="${r.id}" class="${selected.includes(r.id)?'controlrow':''}"><td><input type="checkbox" aria-label="选择第 ${r.index+1} 个测点" data-select="${r.id}" ${selected.includes(r.id)?'checked':''}></td><td>${r.index+1}</td>${['feature','no','fore','back'].map(k=>`<td class="editable" tabindex="0" data-id="${r.id}" data-key="${k}">${escape(r[k])}</td>`).join('')}<td>${format(r.measured)}</td><td class="${r.design===null?'undesign':''}">${format(r.design)}</td><td>${format(r.slope,1,'')}</td><td>${format(r.increment,1,'')}</td><td class="${r.lift===null?'undesign':r.lift<0?'negative':''}">${format(r.lift)}</td></tr>`).join('');
  document.querySelectorAll('[data-select]').forEach(i=>i.onchange=()=>toggle(i.dataset.select));
  document.querySelectorAll('td.editable').forEach(td=>{td.onclick=()=>edit(td);td.onkeydown=e=>{if(e.key==='Enter')edit(td);};});
  drawChart();
}
function clearInvalid(input){input.classList.remove('invalid');input.removeAttribute('aria-invalid');input.parentElement.querySelector('.inline-error')?.remove();}
function invalid(input,text){clearInvalid(input);input.classList.add('invalid');input.setAttribute('aria-invalid','true');const s=document.createElement('span');s.className='inline-error';s.textContent=text;input.after(s);status(text+'；计算仍使用上一次有效数据。');}
function edit(td){
  if(td.querySelector('input'))return;
  const {id,key}=td.dataset, point=project().points.find(p=>p.id===id), old=point[key];
  const input=document.createElement('input');input.value=old??'';input.setAttribute('aria-label',`${key} ${point.no}`);td.textContent='';td.append(input);input.focus();input.select();let done=false;
  const commit=()=>{if(done)return;try{const value=key==='feature'?input.value:integer(input.value,{no:'点号',fore:'前视读数',back:'后视读数'}[key],key==='back');done=true;mutate(p=>p.points.find(r=>r.id===id)[key]=value);}catch(e){invalid(input,e.message);}};
  input.onclick=e=>e.stopPropagation();input.onblur=commit;
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')commit();if(e.key==='Escape'){done=true;render();}};
}

const svgNS='http://www.w3.org/2000/svg';
function node(tag,attrs,text){const el=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text!==undefined)el.textContent=text;return el;}
let geometry=null;
function drawChart(){
  const svg=$('chart'),width=svg.clientWidth||900,height=svg.clientHeight||340;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren();if(!results.length){geometry=null;return;}
  const step=project().sleepers*.6,total=results.at(-1).distance;
  if(!view)view={min:-step*.5,max:Math.max(step,total)+step*.5,yOffset:0};
  const visible=results.filter(r=>r.distance>=view.min-step&&r.distance<=view.max+step);
  const vals=(visible.length?visible:results).flatMap(r=>[r.measured,...(r.design===null?[]:[r.design]),...(Object.hasOwn(project().controls,r.id)?[r.measured+project().controls[r.id]]:[])]);
  const min=Math.min(...vals),max=Math.max(...vals),pad=Math.max(15,(max-min)*.15);
  const yMin=min-pad+(view.yOffset||0),yMax=max+pad+(view.yOffset||0),left=62,right=24,top=30,bottom=36;
  const x=v=>left+(v-view.min)/(view.max-view.min)*(width-left-right), y=v=>height-bottom-(v-yMin)/(yMax-yMin)*(height-top-bottom);
  geometry={x,y,width,height,left,right,top,bottom,yMin,yMax};
  const defs=node('defs',{}),clip=node('clipPath',{id:'plotClip'});clip.append(node('rect',{x:left,y:top,width:width-left-right,height:height-top-bottom}));defs.append(clip);svg.append(defs);
  for(let t=0;t<=5;t++){const value=yMin+(yMax-yMin)*t/5;svg.append(node('line',{x1:left,y1:y(value),x2:width-right,y2:y(value),stroke:'#e6eef1','stroke-dasharray':'3 4'}));svg.append(node('text',{x:left-9,y:y(value)+4,'text-anchor':'end',fill:'#8b9ca5','font-size':10},Math.round(value)));}
  for(let t=0;t<=6;t++){const value=view.min+(view.max-view.min)*t/6;svg.append(node('text',{x:x(value),y:height-13,'text-anchor':'middle',fill:'#8b9ca5','font-size':10},value.toFixed(1)));}
  svg.append(node('text',{x:12,y:16,fill:'#92a3ad','font-size':10},'高程 mm'));svg.append(node('text',{x:width-right,y:height-1,'text-anchor':'end',fill:'#92a3ad','font-size':9},'累计距离 m'));
  const group=node('g',{'clip-path':'url(#plotClip)'});svg.append(group);
  for(const [field,color] of [['measured','#27899a'],['design','#df9e3d']]){
    let d='',active=false;for(const r of results){if(r[field]===null){active=false;continue;}d+=`${active?'L':'M'}${x(r.distance)},${y(r[field])} `;active=true;}
    group.append(node('path',{d,fill:'none',stroke:color,'stroke-width':field==='design'?2.5:1.8,'stroke-linejoin':'round'}));
  }
  for(const r of visible){
    const selected=Object.hasOwn(project().controls,r.id),negative=r.lift!==null&&r.lift<0;
    group.append(node('circle',{cx:x(r.distance),cy:y(r.measured),r:3,fill:negative?'#d4374f':'#fff',stroke:negative?'#d4374f':'#27899a','stroke-width':1.3}));
    if(selected){const cy=y(r.measured+project().controls[r.id]);group.append(node('line',{x1:x(r.distance),y1:y(r.measured),x2:x(r.distance),y2:cy,stroke:'#dca855','stroke-dasharray':'3 3'}));group.append(node('circle',{cx:x(r.distance),cy,r:6,fill:'#fff7e9',stroke:'#d99432','stroke-width':2.2}));}
    const texts=[];if($('labelNo').checked)texts.push(String(r.no));if($('labelFeature').checked&&r.feature)texts.push(r.feature);if($('labelLift').checked&&r.lift!==null)texts.push(format(r.lift)+' mm');
    if(texts.length)group.append(node('text',{x:x(r.distance)+5,y:y(r.measured)-12,fill:negative?'#d4374f':'#617d88','font-size':10},texts.join(' · ')));
  }
}
function coords(e){const r=$('chart').getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function hit(e){if(!geometry)return null;const c=coords(e),g=geometry;let best=null,dist=Infinity;for(const r of results){const ys=[g.y(r.measured)];if(Object.hasOwn(project().controls,r.id))ys.push(g.y(r.measured+project().controls[r.id]));const d=Math.min(...ys.map(y=>Math.hypot(g.x(r.distance)-c.x,y-c.y)));if(d<dist){best=r;dist=d;}}return dist<=16?best:null;}
$('chart').onclick=e=>{const r=hit(e);if(r)toggle(r.id);};
$('chart').oncontextmenu=e=>e.preventDefault();
$('chart').onpointerdown=e=>{if(e.button===2&&view){pan={...coords(e),view:{...view}};$('chart').setPointerCapture(e.pointerId);}};
$('chart').onpointerup=()=>pan=null;
$('chart').onpointercancel=()=>pan=null;
$('chart').onpointermove=e=>{
  if(pan&&geometry){const c=coords(e),g=geometry,dx=(c.x-pan.x)/(g.width-g.left-g.right)*(pan.view.max-pan.view.min);view={min:pan.view.min-dx,max:pan.view.max-dx,yOffset:pan.view.yOffset+(c.y-pan.y)/(g.height-g.top-g.bottom)*(g.yMax-g.yMin)};drawChart();$('tooltip').hidden=true;return;}
  const r=hit(e),tip=$('tooltip');tip.hidden=!r;if(!r)return;
  tip.textContent=`现场点号 ${r.no}${r.no!==r.index+1?` · 记录序号 ${r.index+1}`:''}\n实测高程 ${format(r.measured)} mm\n设计高程 ${format(r.design)}${r.design===null?'':' mm'}\n起道量 ${format(r.lift)}${r.lift===null?'':' mm'}`;
  const c=coords(e);tip.style.left=Math.min(c.x+14,geometry.width-240)+'px';tip.style.top=Math.max(8,Math.min(c.y+12,geometry.height-120))+'px';
};
$('chart').onpointerleave=()=>$('tooltip').hidden=true;
$('chart').addEventListener('wheel',e=>{
  if(!geometry||!view)return;e.preventDefault();const g=geometry,c=coords(e),ratio=Math.max(0,Math.min(1,(c.x-g.left)/(g.width-g.left-g.right))),span=view.max-view.min;
  const newSpan=Math.max(project().sleepers*.6*2,Math.min((results.at(-1).distance+project().sleepers*.6)*1.3,span*(e.deltaY>0?1.2:1/1.2)));
  const anchor=view.min+ratio*span;view={min:anchor-newSpan*ratio,max:anchor+newSpan*(1-ratio),yOffset:0};drawChart();$('tooltip').hidden=true;
},{passive:false});
new ResizeObserver(drawChart).observe($('chart'));
render();
