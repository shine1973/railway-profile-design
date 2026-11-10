import {designSegments} from '../src/core.js';
import {curveGeometry} from '../src/vertical-curves.js';

export function addFormulas(book,project,rows,model,options) {
  book.calcProperties.fullCalcOnLoad=true;
  const main=book.getWorksheet('测量数据'),params=book.getWorksheet('参数');
  const helper=book.addWorksheet('计算过程');
  helper.addRow(['记录序号','相对仪器高 mm','相对实测 mm','直坡设计 mm','负起道图示点','对应竖曲线序号']);
  const put=(sheet,address,formula,result)=>{sheet.getCell(address).value={formula,result};};
  const n=rows.length+1, controls=new Map();let cr=6;
  rows.forEach(r=>{if(Object.hasOwn(project.controls,r.id))controls.set(r.id,cr++);});
  const target=id=>{const i=rows.findIndex(r=>r.id===id)+2;return `('测量数据'!F${i}+'参数'!$D$${controls.get(id)})`;};
  put(params,'D3','$D$2*0.6',project.sleepers*.6);
  put(params,'D4',`10-MIN('计算过程'!C2:C${n})`,rows[0].datum);
  params.getCell('D2').dataValidation={type:'whole',operator:'between',formulae:[1,1000],showErrorMessage:true,error:'请输入1至1000的整数'};
  for(const [id,i] of controls){params.getCell(`D${i}`).dataValidation={type:'whole',operator:'between',formulae:[-100000000,100000000],showErrorMessage:true,error:'起道设置须为整毫米'};}
  const geometry=curveGeometry(project,rows);
  const segments=designSegments(project).map(s=>s.map(id=>rows.find(r=>r.id===id)).sort((a,b)=>a.index-b.index));
  for(const r of rows){
    const i=r.index+2;
    helper.getCell(`A${i}`).value=r.index+1;
    put(helper,`B${i}`,i===2?`'测量数据'!C2`:`IF('测量数据'!D${i-1}="",B${i-1},C${i-1}+'测量数据'!D${i-1})`,r.instrument-r.datum);
    put(helper,`C${i}`,`B${i}-'测量数据'!C${i}`,r.measured-r.datum);
    put(main,`E${i}`,`'计算过程'!B${i}+'参数'!$D$4`,r.instrument);
    put(main,`F${i}`,`E${i}-C${i}`,r.measured);
    put(params,`A${i}`,`(B${i}-1)*$D$3`,r.distance);
    const seg=segments.find(([a,b])=>r.index>=a.index&&r.index<=b.index);
    const pairIndex=geometry.curves.findIndex(c=>r.distance>=c.from&&r.distance<=c.to);
    if(pairIndex>=0){const c=geometry.curves[pairIndex],j=pairIndex+2,x=`'参数'!A${i}`;
      put(helper,`D${i}`,`('竖曲线参数'!D${j}+IF(${x}<'竖曲线参数'!C${j},'竖曲线参数'!E${j},'竖曲线参数'!F${j})*(${x}-'竖曲线参数'!C${j}))*1000`,(c.y+(r.distance<c.x?c.m1:c.m2)*(r.distance-c.x))*1000);
    } else if(seg){const [a,b]=seg;const formula=`${target(a.id)}+(${target(b.id)}-${target(a.id)})*${r.index-a.index}/${b.index-a.index}`;
      const value=a.measured+project.controls[a.id]+(b.measured+project.controls[b.id]-a.measured-project.controls[a.id])*(r.index-a.index)/(b.index-a.index);
      put(helper,`D${i}`,formula,value);
    } else helper.getCell(`D${i}`).value='未设计';
  }
  const curves=book.addWorksheet('竖曲线参数');
  curves.addRow(['前后坡段','半径 m（可改）','交点距离 m','交点高程 m','前坡比','后坡比','前坡角','后坡角','方向','切线长 m','起点距离 m','终点距离 m','起点高程 m','圆心横坐标 m','圆心高程 m','几何有效','弧长 m']);
  geometry.curves.forEach((c,k)=>{
    const i=k+2,a=rows.find(r=>r.id===c.a),b=rows.find(r=>r.id===c.b),le=rows.find(r=>r.id===c.leftEnd),rs=rows.find(r=>r.id===c.rightStart);
    const x=r=>`'参数'!A${r.index+2}`;
    curves.getCell(`A${i}`).value=`坡段 ${c.leftIndex+1} → ${c.rightIndex+1}`;curves.getCell(`B${i}`).value=c.radius;
    curves.getCell(`B${i}`).dataValidation={type:'decimal',operator:'between',formulae:[.001,10000000],showErrorMessage:true,error:'半径须大于0且不超过10000000米'};
    put(curves,`E${i}`,`(${target(c.leftEnd)}-${target(c.a)})/1000/(${x(le)}-${x(a)})`,c.m1);
    put(curves,`F${i}`,`(${target(c.b)}-${target(c.rightStart)})/1000/(${x(b)}-${x(rs)})`,c.m2);
    put(curves,`C${i}`,`(${target(c.rightStart)}/1000-${target(c.a)}/1000+E${i}*${x(a)}-F${i}*${x(rs)})/(E${i}-F${i})`,c.x);
    put(curves,`D${i}`,`${target(c.a)}/1000+E${i}*(C${i}-${x(a)})`,c.y);
    put(curves,`G${i}`,`ATAN(E${i})`,Math.atan(c.m1));put(curves,`H${i}`,`ATAN(F${i})`,Math.atan(c.m2));
    put(curves,`I${i}`,`SIGN(H${i}-G${i})`,c.sign);
    put(curves,`J${i}`,`B${i}*TAN(ABS(H${i}-G${i})/2)`,c.tangent);
    put(curves,`K${i}`,`C${i}-J${i}*COS(G${i})`,c.start);
    put(curves,`L${i}`,`C${i}+J${i}*COS(H${i})`,c.end);
    put(curves,`M${i}`,`D${i}-J${i}*SIN(G${i})`,c.startY);
    put(curves,`N${i}`,`K${i}-I${i}*B${i}*SIN(G${i})`,c.cx);
    put(curves,`O${i}`,`M${i}+I${i}*B${i}*COS(G${i})`,c.cy);
    put(curves,`P${i}`,`AND(B${i}>0,B${i}<=10000000,ABS(H${i}-G${i})>1E-12,K${i}>='参数'!A${a.index+2}-1E-8,L${i}<='参数'!A${b.index+2}+1E-8${k?`,K${i}>=L${i-1}-1E-8`:''})`,true);
    put(curves,`Q${i}`,`B${i}*ABS(H${i}-G${i})`,c.length);
  });
  for(const r of rows){
    const i=r.index+2;let expr=`'计算过程'!D${i}`;
    if(r.design!==null){
      if(geometry.curves.length){
        const last=geometry.curves.length+1,x=`'参数'!A${i}`;
        const active=geometry.curves.reduce((index,c,k)=>r.distance>=c.start?k+1:index,0);
        put(helper,`F${i}`,`IFERROR(MATCH(${x},'竖曲线参数'!$K$2:$K$${last},1),0)`,active);
        const match=`'计算过程'!F${i}`,ref=col=>`INDEX('竖曲线参数'!$${col}$2:$${col}$${last},MAX(1,${match}))`;
        const u=`(${x}-${ref('N')})`,u0=`(${ref('K')}-${ref('N')})`;
        const y=`(${ref('M')}+${ref('I')}*(${u}^2-${u0}^2)/(SQRT(MAX(0,${ref('B')}^2-${u}^2))+SQRT(MAX(0,${ref('B')}^2-${u0}^2))))*1000`;
        expr=`IF(AND(${match}>0,${x}<=${ref('L')}),${y},${expr})`;
      }
      if(geometry.curves.length){
        const last=geometry.curves.length+1,idx=`MAX(1,'计算过程'!F${i})`;
        put(main,`K${i}`,`IF(AND('计算过程'!F${i}>0,'参数'!A${i}<=INDEX('竖曲线参数'!$L$2:$L$${last},${idx})),INDEX('竖曲线参数'!$B$2:$B$${last},${idx}),"")`,r.radius??'');
      }
      if(geometry.curves.length)expr=`IF(COUNTIF('竖曲线参数'!P2:P${geometry.curves.length+1},FALSE)>0,NA(),${expr})`;
    }
    put(main,`G${i}`,expr,r.design??'未设计');
    put(main,`J${i}`,`IF(ISNUMBER(G${i}),G${i}-F${i},G${i})`,r.lift??'未设计');
    if(r.slope!==null){put(main,`I${i}`,`G${i+1}-G${i}`,r.increment);put(main,`H${i}`,`I${i}/'参数'!$D$3`,r.slope);}
    if(controls.has(r.id))put(params,`H${i}`,`${target(r.id)}+$J$2`,r.measured+project.controls[r.id]+model.offset);
    put(helper,`E${i}`,`IF(IFERROR('测量数据'!J${i}<0,FALSE),IF(ISNUMBER('测量数据'!J${i}),'参数'!F${i},NA()),NA())`,r.lift!==null&&r.lift<0?r.measured+model.offset:{error:'#N/A'});
    const parts=[];
    if(options.labelNo)parts.push(`'测量数据'!B${i}`);
    if(options.labelFeature!==false&&r.feature)parts.push(`'测量数据'!A${i}`);
    if(options.labelLift&&r.lift!==null)parts.push(`IF('测量数据'!J${i}<0,IF(ROUND('测量数据'!J${i},0)=0,"−0",TEXT('测量数据'!J${i},"0")),TEXT('测量数据'!J${i},"0"))&" mm"`);
    if(parts.length)put(params,`R${i}`,parts.join('&" · "&'),[options.labelNo?String(r.no):'',options.labelFeature!==false?r.feature:'',options.labelLift&&r.lift!==null?String(Math.round(r.lift))+' mm':''].filter(Boolean).join(' · '));
  }
  // All chart heights use this dynamic common offset. Keep controls included even when pending.
  const minimum=`MIN('测量数据'!F2:G${n}${[...controls.keys()].map(id=>`,${target(id)}`).join('')})`;
  put(params,'J2',`IF(${minimum}<0,CEILING((100-${minimum})/100,1)*100,0)`,model.offset);
  put(params,'S2','IF(J2=0,"纵断面对比","纵断面对比（图示高程额外偏移 +"&TEXT(J2,"0")&" mm）")',model.offset?`纵断面对比（图示高程额外偏移 +${model.offset} mm）`:'纵断面对比');
  const guide=book.addWorksheet('公式使用说明');guide.getColumn(1).width=110;
  [
    '公式成果：修改输入后由 Excel / WPS 自动重算；如处于手动计算模式，请执行重新计算。',
    '可修改：测量数据前四列；参数表 D2 轨枕根数、D6起的控制点起道量；竖曲线参数 B列半径。蓝色单元格为参数输入。',
    '坡段拓扑和控制点记录序号固定。增删记录、移动端点、增删坡段或竖曲线，请返回软件操作并重新导出。',
    '前后坡段各由两个测点确定，竖曲线交点由坡线延长计算；实际起道量以测量数据 J列为准。',
    '竖曲线参数 P列为FALSE表示越界、重叠、半径无效或两坡相同；设计结果显示#N/A，请调整后再使用。此项仅为几何检查，不代表符合规范。',
    '图表沿用导出时的显示范围和刻度。修改输入后系列随公式更新；如超出坐标范围，请在Excel/WPS中调整坐标轴。',
    '高程和起道量显示整毫米；坡度和递增量显示一位小数，公式保留完整精度。未设计区间保持空白坡线。',
    `线路类别：${project.lineType??'未指定'}；${project.speedBasis??'允许速度'}：${project.speed??'未指定'} km/h。推荐半径尚无已核实规则。`
  ].forEach(t=>{const row=guide.addRow([t]);row.height=40;row.alignment={wrapText:true,vertical:'middle'};});
  for(const c of ['D2',...[...controls.values()].map(i=>`D${i}`)])params.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F1FF'}};
  geometry.curves.forEach((c,k)=>{curves.getCell(`B${k+2}`).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F1FF'}};});
  [helper,curves].forEach(s=>{s.columns.forEach(c=>c.width=22);s.views=[{state:'frozen',ySplit:1}];});
}
