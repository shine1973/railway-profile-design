import {newProject,calculate,integer,format,History,moveControl,pickEndpoint,removeControl,removeSegment,cancelPending} from './core.js';
import {fullView,clampView,zoomView,chartModel} from './chart-view.js';
import {layoutLabels} from './chart-labels.js';
const labelMeasure=document.createElement('canvas').getContext('2d');
labelMeasure.font='11px -apple-system, BlinkMacSystemFont, Segoe UI, Microsoft YaHei, sans-serif';
const $=id=>document.getElementById(id), api=window.desktop;
let history=new History(newProject()), saved=JSON.stringify(history.current), results=[], view=null, pan=null, busy=false;
const project=()=>pan?.preview??history.current;
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function status(text){$('status').textContent=text;}
function message(text,title='请检查'){ $('messageTitle').textContent=title;$('messageText').textContent=text;$('message').showModal(); }
$('messageClose').onclick=()=>$('message').close();
function dirty(){return JSON.stringify(history.current)!==saved;}
function mutate(fn){const p=structuredClone(project());fn(p);history.change(p);render();}
async function replaceAllowed(){
  if(!dirty())return true;
  return new Promise(resolve=>{const d=$('confirm');d.showModal();$('cancelReplace').onclick=()=>{d.close();resolve(false);};$('acceptReplace').onclick=()=>{d.close();resolve(true);};d.oncancel=()=>resolve(false);});
}
async function action(fn){if(busy||pan)return;busy=true;try{await fn();}catch(e){message(e.message);}finally{busy=false;render();}}
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
$('template').onclick=()=>action(async()=>{const file=await request('exportTemplate');if(file)status(`已导出填写模板：${file}`);});
$('export').onclick=()=>action(async()=>{const file=await request('exportExcel',project(),{view,plotWidth:Math.max(100,($('chart').clientWidth||900)-86),labelNo:$('labelNo').checked,labelFeature:$('labelFeature').checked,labelLift:$('labelLift').checked});if(file)status(`已导出可编辑图表及成果：${file}`);});
$('demo').onclick=()=>action(async()=>{
  if(!await replaceAllowed())return;
  const points=Array.from({length:45},(_,i)=>({id:`p${i+1}`,sourceRow:i+2,feature:i===0?'起点':i===17?'道岔尖轨':i===44?'终点':'',no:i-2,fore:1200+Math.round(i*3+32*Math.sin(i/5)),back:null}));
  history=new History(newProject(points,'演示项目（非现场数据）'));saved='';view=null;status('演示数据已载入。点击两个测点开始拉坡。');
});
$('projectName').onchange=e=>mutate(p=>{p.name=e.target.value.trim()||'未命名项目';});
$('sleepers').onchange=e=>{try{const n=integer(e.target.value,'轨枕根数');if(n<1||n>1000)throw new Error('轨枕根数须在 1 至 1000 之间');view=null;mutate(p=>p.sleepers=n);}catch(err){message(err.message);e.target.value=project().sleepers;}};
$('undo').onclick=()=>{history.undo();render();};$('redo').onclick=()=>{history.redo();render();};
$('clear').onclick=()=>mutate(p=>{p.controls={};p.segments=[];p.pendingControl=null;});
$('fit').onclick=()=>{view=null;drawChart();};
['labelNo','labelFeature','labelLift'].forEach(id=>$(id).onchange=drawChart);
document.addEventListener('keydown',e=>{if(pan){if(e.key!=='Escape')e.preventDefault();return;}if((e.metaKey||e.ctrlKey)&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){if(e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?history.redo():history.undo();render();}if(e.key.toLowerCase()==='s'){e.preventDefault();$('save').click();}}});
function toggle(id){try{mutate(p=>pickEndpoint(p,id));status(project().pendingControl?'已选第一个端点，请选择本段另一个端点':'坡段已完成，请重新选择下一段的两个端点');}catch(e){message(e.message);}}

function render(){
  results=calculate(project());
  $('projectName').value=project().name;$('sleepers').value=project().sleepers;$('spacing').textContent=(project().sleepers*.6).toFixed(1)+' m';
  const selected=Object.keys(project().controls), designed=results.filter(r=>r.design!==null), negative=designed.filter(r=>r.lift<0);
  $('pointCount').textContent=results.length||'—';$('controlCount').textContent=selected.length;$('controlBadge').textContent=selected.length;
  $('designedCount').textContent=designed.length;$('maxLift').textContent=designed.length?format(Math.max(...designed.map(r=>r.lift))):'—';
  $('negativeCount').textContent=negative.length;$('negativeCount').classList.toggle('negative',negative.length>0);
  $('saveState').textContent=dirty()?'● 未保存':results.length?'已保存':'尚未导入';
  api?.setDirty(dirty());
  $('save').disabled=busy||!results.length;$('export').disabled=busy||!results.length;$('import').disabled=busy;$('open').disabled=busy;$('template').disabled=busy;
  $('undo').disabled=!history.past.length;$('redo').disabled=!history.future.length;$('clear').disabled=!selected.length;
  $('empty').hidden=results.length>0;
  $('controls').innerHTML=results.filter(r=>selected.includes(r.id)).map(r=>`<div class="controlitem ${r.id===project().pendingControl?'pendingcontrol':''}"><div class="top"><span>点号 ${r.no}${r.no!==r.index+1?` <small> / 序号 ${r.index+1}</small>`:''}</span><button data-remove="${r.id}" aria-label="取消控制点 ${r.no}">×</button></div><label>起道量 <input type="text" inputmode="numeric" aria-label="控制点 ${r.no} 起道量" data-lift="${r.id}" value="${project().controls[r.id]}" class="${project().controls[r.id]<0?'negative':''}"> mm</label></div>`).join('') || '<p class="hint">尚未选择控制点。<br>每次选择两个端点生成独立坡段。</p>';
  const pending=results.find(r=>r.id===project().pendingControl);
  $('selectionHint').hidden=!pending;
  $('chartBasis').hidden=Boolean(pending);
  $('selectionHint').textContent=pending?`已选起点：点号 ${pending.no} · 记录序号 ${pending.index+1}，请选择另一端`:'';
  $('selectionHint').title=$('selectionHint').textContent;
  const segmentRows=project().segments.map(([a,b],i)=>{const start=results.find(r=>r.id===a),end=results.find(r=>r.id===b);return `<div class="segmentitem">坡段 ${i+1} · 序号 ${start.index+1} ↔ ${end.index+1}<button data-segment="${i}" aria-label="删除坡段 ${i+1}">删除</button></div>`;}).join('');
  $('controls').insertAdjacentHTML('afterbegin',`<div class="segmenthint">${pending?`已选序号 ${pending.index+1}，请选另一端 <button id="cancelPending">取消</button>`:'每次重新选两个端点，独立生成一段'}</div>${segmentRows}`);
  if($('cancelPending'))$('cancelPending').onclick=()=>mutate(cancelPending);
  document.querySelectorAll('[data-segment]').forEach(b=>b.onclick=()=>mutate(p=>removeSegment(p,Number(b.dataset.segment))));
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>mutate(p=>removeControl(p,b.dataset.remove)));

  document.querySelectorAll('[data-lift]').forEach(input=>{
    input.onchange=()=>{try{const value=integer(input.value,'起道量');mutate(p=>p.controls[input.dataset.lift]=value);}catch(e){invalid(input,e.message);}};
    input.onkeydown=e=>{if(e.key==='Enter'){input.blur();}if(e.key==='Escape'){input.value=project().controls[input.dataset.lift];clearInvalid(input);input.blur();}};
  });
  $('rows').innerHTML=results.map(r=>`<tr data-row="${r.id}" class="${selected.includes(r.id)?'controlrow':''} ${r.id===project().pendingControl?'pendingrow':''}"><td><input type="checkbox" aria-label="选择第 ${r.index+1} 个测点" data-select="${r.id}" ${selected.includes(r.id)?'checked':''}></td><td>${r.index+1}</td>${['feature','no','fore','back'].map(k=>`<td class="editable" tabindex="0" data-id="${r.id}" data-key="${k}">${escape(r[k])}</td>`).join('')}<td>${format(r.instrument)}</td><td>${format(r.measured)}</td><td class="${r.design===null?'undesign':''}">${format(r.design)}</td><td>${format(r.slope,1,'')}</td><td>${format(r.increment,1,'')}</td><td class="${r.lift===null?'undesign':r.lift<0?'negative':''}">${format(r.lift)}</td></tr>`).join('');
  document.querySelectorAll('[data-select]').forEach(i=>i.onclick=e=>{e.preventDefault();toggle(i.dataset.select);});
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
  const svg=$('chart'),width=svg.clientWidth||900;
  svg.replaceChildren();if(!results.length){geometry=null;svg.parentElement.style.height='340px';return;}
  if(!view)view=fullView(results.length);
  const model=chartModel(results,project().controls,{view,plotWidth:width-86});
  const {visible,offset,axis}=model;
  const yMin=axis.min,yMax=axis.max,left=62,right=24,bottom=36;
  const labelItems=visible.filter(r=>r.index+1>=view.min&&r.index+1<=view.max).flatMap(r=>{
    const texts=[];
    if($('labelNo').checked)texts.push(String(r.no));
    if($('labelFeature').checked&&r.feature)texts.push(r.feature);
    if($('labelLift').checked&&r.lift!==null)texts.push(format(r.lift)+' mm');
    return texts.length?[{id:r.id,x:left+(r.index+1-view.min)/(view.max-view.min)*(width-left-right),text:texts.join(' · '),value:r.measured,negative:r.lift!==null&&r.lift<0}]:[];
  });
  const labelLayout=layoutLabels(labelItems,left,width-right,text=>labelMeasure.measureText(text).width);
  const height=340+labelLayout.height,top=30+labelLayout.height;
  const desiredHeight=height+'px';if(svg.parentElement.style.height!==desiredHeight)svg.parentElement.style.height=desiredHeight;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const x=v=>left+(v-view.min)/(view.max-view.min)*(width-left-right), y=v=>height-bottom-(v+offset-yMin)/(yMax-yMin)*(height-top-bottom);
  geometry={x,y,width,height,left,right,top,bottom,yMin,yMax,offset};
  $('chartBasis').textContent=offset ? `图示高程 = 假定高程 + ${offset} mm` : `统一假定基准 · 首点高程 ${results[0].datum} mm`;
  $('zoomLevel').textContent=((fullView(results.length).max-.5)/(view.max-view.min)).toFixed(2)+'×';
  const defs=node('defs',{}),clip=node('clipPath',{id:'plotClip'});clip.append(node('rect',{x:left,y:top,width:width-left-right,height:height-top-bottom}));defs.append(clip);svg.append(defs);
  for(const value of axis.ticks){svg.append(node('line',{x1:left,y1:y(value-offset),x2:width-right,y2:y(value-offset),stroke:'#e6eef1','stroke-dasharray':'3 4'}));svg.append(node('text',{x:left-9,y:y(value-offset)+4,'text-anchor':'end',fill:'#8b9ca5','font-size':10},value));}
  for(const value of model.ticks){svg.append(node('line',{x1:x(value),y1:top,x2:x(value),y2:height-bottom,stroke:'#edf2f4','stroke-dasharray':'3 4'}));svg.append(node('text',{x:x(value),y:height-13,'text-anchor':'middle',fill:'#8b9ca5','font-size':10},value));}
  svg.append(node('text',{x:12,y:16,fill:'#92a3ad','font-size':10},'图示高程 mm'));svg.append(node('text',{x:width-right,y:height-1,'text-anchor':'end',fill:'#92a3ad','font-size':9},'记录序号'));
  const group=node('g',{'clip-path':'url(#plotClip)'});svg.append(group);
  for(const [field,color] of [['measured','#27899a'],['design','#df9e3d']]){
    let d='',active=false,previous=null;for(const r of results){if(field==='design'&&previous?.slope===null)active=false;previous=r;if(r[field]===null){active=false;continue;}d+=`${active?'L':'M'}${x(r.index+1)},${y(r[field])} `;active=true;}
    group.append(node('path',{d,fill:'none',stroke:color,'stroke-width':field==='design'?2.5:1.8,'stroke-linejoin':'round'}));
  }
  for(const r of visible){
    const selected=Object.hasOwn(project().controls,r.id),negative=r.lift!==null&&r.lift<0;
    group.append(node('circle',{cx:x(r.index+1),cy:y(r.measured),r:3,fill:negative?'#d4374f':'#fff',stroke:negative?'#d4374f':'#27899a','stroke-width':1.3}));
    if(selected){
      const cy=y(r.measured+project().controls[r.id]),pending=r.id===project().pendingControl;
      group.append(node('line',{x1:x(r.index+1),y1:y(r.measured),x2:x(r.index+1),y2:cy,stroke:pending?'#2563eb':'#dca855','stroke-dasharray':'3 3'}));
      if(pending)group.append(node('circle',{cx:x(r.index+1),cy,r:11,fill:'none',stroke:'#2563eb','stroke-width':2,'data-pending':r.id,'pointer-events':'none'}));
      group.append(node('circle',{cx:x(r.index+1),cy,r:6,fill:pending?'#2563eb':'#fff7e9',stroke:pending?'#fff':'#d99432','stroke-width':2.2,'aria-label':pending?'已选新坡段起点，请选择另一端':'控制点'}));
    }

  }
  const annotations=node('g',{'pointer-events':'none'});svg.append(annotations);
  for(const label of labelLayout.labels){
    annotations.append(node('line',{x1:label.x+label.width/2,y1:24+label.y+label.height,x2:label.anchorX,y2:y(label.value)-5,stroke:label.negative?'#e7a5af':'#b7cbd1','stroke-width':1,'stroke-dasharray':'2 3'}));
  }
  for(const label of labelLayout.labels){
    annotations.append(node('rect',{x:label.x,y:24+label.y,width:label.width,height:label.height,rx:4,fill:'#fff',stroke:label.negative?'#edc0c7':'#dce7eb'}));
    const text=node('text',{x:label.x+6,y:24+label.y+16,fill:label.negative?'#d4374f':'#446774','font-size':11});
    text.append(node('title',{},label.text));
    label.lines.forEach((line,i)=>text.append(node('tspan',{x:label.x+6,y:24+label.y+16+i*16},line)));
    annotations.append(text);
  }

  if(pan?.controlId&&pan.moved){
    const target=results.find(r=>r.id===pan.targetId);
    if(target){
      const occupied=target.id!==pan.controlId&&Object.hasOwn(pan.original.controls,target.id);
      const color=(occupied||pan.invalid)?'#d4374f':'#d99432';
      const cy=y(target.measured+pan.lift);
      svg.append(node('line',{x1:x(target.index+1),y1:top,x2:x(target.index+1),y2:height-bottom,stroke:color,'stroke-dasharray':'4 4','pointer-events':'none'}));
      svg.append(node('circle',{cx:x(target.index+1),cy,r:9,fill:'#fff7e9',stroke:color,'stroke-width':2,'stroke-dasharray':'3 2','pointer-events':'none'}));
    }
  }

}
function coords(e){const r=$('chart').getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
function hit(e){if(!geometry)return null;const c=coords(e),g=geometry;let best=null,dist=Infinity;for(const r of results){const ys=[g.y(r.measured)];if(Object.hasOwn(project().controls,r.id))ys.push(g.y(r.measured+project().controls[r.id]));const d=Math.min(...ys.map(y=>Math.hypot(g.x(r.index+1)-c.x,y-c.y)));if(d<dist){best=r;dist=d;}}return dist<=16?best:null;}
function controlHit(e){
  if(!geometry)return null;
  const c=coords(e),g=geometry;
  if(c.x<g.left||c.x>g.width-g.right||c.y<g.top||c.y>g.height-g.bottom)return null;
  let best=null,distance=12;
  for(const r of results){
    if(!Object.hasOwn(project().controls,r.id))continue;
    const d=Math.hypot(g.x(r.index+1)-c.x,g.y(r.measured+project().controls[r.id])-c.y);
    if(d<distance){best=r;distance=d;}
  }
  return best;
}
function cancelDrag(){
  const drag=pan;pan=null;$('chart').classList.remove('dragging');
  if(drag&&$('chart').hasPointerCapture(drag.pointerId))$('chart').releasePointerCapture(drag.pointerId);
  if(drag?.controlId){render();status('已取消移动控制点');}
}
document.addEventListener('keydown',e=>{if(pan){if(e.key==='Escape'){e.preventDefault();cancelDrag();}}});
$('chart').oncontextmenu=e=>e.preventDefault();
$('chart').onpointerdown=e=>{
  if(!busy&&!pan&&(e.button===0||e.button===2)&&view){
    const control=e.button===0?controlHit(e):null;
    pan={...coords(e),view:{...view},button:e.button,moved:false,pointerId:e.pointerId,controlId:control?.id,targetId:control?.id,original:control?structuredClone(history.current):null,lift:control?history.current.controls[control.id]:null,preview:null};
    $('chart').setPointerCapture(e.pointerId);
  }
};
$('chart').onpointerup=e=>{
  if(!pan||e.pointerId!==pan.pointerId)return;
  const drag=pan;pan=null;$('chart').classList.remove('dragging');
  if($('chart').hasPointerCapture(e.pointerId))$('chart').releasePointerCapture(e.pointerId);
  if(drag.controlId&&drag.moved){
    const next=structuredClone(history.current);
    if(moveControl(next,drag.controlId,drag.targetId)){
      history.change(next);render();
      const target=results.find(r=>r.id===drag.targetId);
      status(`控制点已移至现场点号 ${target.no} · 记录序号 ${target.index+1}，起道量保持 ${format(next.controls[target.id])} mm`);
    }else{render();status(drag.targetId===drag.controlId?'控制点位置未改变':'目标位置被占用或会使坡段重叠，本次移动未提交');}
  }else if(drag.button===0&&!drag.moved){const r=hit(e);if(r)toggle(r.id);}
};
$('chart').onpointercancel=cancelDrag;
$('chart').onlostpointercapture=cancelDrag;
$('chart').onpointermove=e=>{
  if(pan&&geometry){
    if(e.pointerId!==pan.pointerId)return;
    const c=coords(e),g=geometry;
    if(Math.hypot(c.x-pan.x,c.y-pan.y)>4)pan.moved=true;
    if(pan.moved){
      if(pan.controlId){
        const sequence=pan.view.min+(c.x-g.left)/(g.width-g.left-g.right)*(pan.view.max-pan.view.min);
        const first=Math.max(1,Math.ceil(pan.view.min)),last=Math.min(results.length,Math.floor(pan.view.max));
        const target=results[Math.max(first,Math.min(last,Math.round(sequence)))-1];
        const changed=target.id!==pan.targetId;
        pan.targetId=target.id;
        const occupied=target.id!==pan.controlId&&Object.hasOwn(pan.original.controls,target.id);
        if(changed){
          const preview=structuredClone(pan.original);
          const allowed=moveControl(preview,pan.controlId,target.id);
          pan.invalid=target.id!==pan.controlId&&!allowed;
          pan.preview=allowed?preview:null;
          render();
        }
        status((occupied||pan.invalid)?'目标位置被占用或坡段重叠，松开将取消移动':`移至现场点号 ${target.no} · 记录序号 ${target.index+1}，松开确认，Esc取消`);
      }else{
        const dx=(c.x-pan.x)/(g.width-g.left-g.right)*(pan.view.max-pan.view.min);
        view=clampView({min:pan.view.min-dx,max:pan.view.max-dx},results.length);
      }
      $('chart').classList.add('dragging');drawChart();$('tooltip').hidden=true;
    }
    return;
  }
  const r=hit(e),tip=$('tooltip');tip.hidden=!r;if(!r)return;
  tip.textContent=`${r.feature?`特征点 ${r.feature}\n`:''}现场点号 ${r.no}${r.no!==r.index+1?` · 记录序号 ${r.index+1}`:''}\n图示实测 ${format(r.measured+geometry.offset)} mm\n图示设计 ${format(r.design===null?null:r.design+geometry.offset)}${r.design===null?'':' mm'}\n起道量 ${format(r.lift)}${r.lift===null?'':' mm'}`;
  const c=coords(e);tip.style.left=Math.min(c.x+14,geometry.width-240)+'px';tip.style.top=Math.max(8,Math.min(c.y+12,geometry.height-120))+'px';
};
$('chart').onpointerleave=()=>$('tooltip').hidden=true;
$('chart').addEventListener('wheel',e=>{
  if(!geometry||!view||pan)return;e.preventDefault();const g=geometry,c=coords(e),ratio=Math.max(0,Math.min(1,(c.x-g.left)/(g.width-g.left-g.right)));
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?g.height:1);
  view=zoomView(view,results.length,ratio,delta,Number($('zoomSensitivity').value));
  drawChart();$('tooltip').hidden=true;
},{passive:false});
new ResizeObserver(drawChart).observe($('chart'));
render();
