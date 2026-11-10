import {designSegments} from '../src/core.js';
import {curveGeometry,curveHeight} from '../src/vertical-curves.js';

export function addFormulas(book,project,rows,model,options) {
  book.calcProperties.fullCalcOnLoad=true;
  const main=book.getWorksheet('测量数据'),params=book.getWorksheet('参数');
  const helper=book.addWorksheet('计算过程');
  helper.addRow(['记录序号','相对仪器高 mm','相对实测 mm','直坡设计 mm','负起道图示点','对应竖曲线序号','距离 m','交点距离 m','交点高程 mm','所在直坡比','距交点 m']);
  const put=(sheet,address,formula,result)=>{sheet.getCell(address).value={formula,result};};
  const n=rows.length+1, controls=new Map();let cr=6;
  rows.forEach(r=>{if(Object.hasOwn(project.controls,r.id))controls.set(r.id,cr++);});
  const target=id=>`'输入参数'!$E$${controls.get(id)}`;
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
      put(helper,`G${i}`,x,r.distance);
      put(helper,`H${i}`,`'竖曲线参数'!C$${j}`,c.x);
      put(helper,`I${i}`,`'竖曲线参数'!D$${j}*1000`,c.y*1000);
      put(helper,`J${i}`,`IF(G${i}<H${i},'竖曲线参数'!E$${j},'竖曲线参数'!F$${j})`,r.distance<c.x?c.m1:c.m2);
      put(helper,`K${i}`,`G${i}-H${i}`,r.distance-c.x);
      put(helper,`D${i}`,`I${i}+J${i}*K${i}*1000`,(c.y+(r.distance<c.x?c.m1:c.m2)*(r.distance-c.x))*1000);
    } else if(seg){const [a,b]=seg,j=segments.indexOf(seg)+2;
      const value=a.measured+project.controls[a.id]+(b.measured+project.controls[b.id]-a.measured-project.controls[a.id])*(r.index-a.index)/(b.index-a.index);
      put(helper,`D${i}`,`'坡段计算'!F$${j}+(A${i}-'坡段计算'!B$${j})*'坡段计算'!K$${j}`,value);
    } else helper.getCell(`D${i}`).value='未设计';
  }
  const curves=book.addWorksheet('竖曲线参数');
  curves.addRow(['前后坡段','半径 m（引用）','交点距离 m','交点高程 m','前坡比','后坡比','前坡角','后坡角','方向','切线长 m','起点距离 m','终点距离 m','起点高程 m','圆心横坐标 m','圆心高程 m','几何有效','弧长 m','前段起点距离 m','前段起点高程 mm','前段终点距离 m','前段终点高程 mm','后段起点距离 m','后段起点高程 mm','后段终点距离 m','后段终点高程 mm','半径有效','坡差有效','范围有效','不重叠']);
  geometry.curves.forEach((c,k)=>{
    const i=k+2,a=rows.find(r=>r.id===c.a),b=rows.find(r=>r.id===c.b),le=rows.find(r=>r.id===c.leftEnd),rs=rows.find(r=>r.id===c.rightStart);
    const x=r=>`'参数'!A${r.index+2}`;
    curves.getCell(`A${i}`).value=`坡段 ${c.leftIndex+1} → ${c.rightIndex+1}`;curves.getCell(`B${i}`).value=c.radius;
    curves.getCell(`B${i}`).dataValidation={type:'decimal',operator:'between',formulae:[.001,10000000],showErrorMessage:true,error:'半径须大于0且不超过10000000米'};
    for(const [col,row] of [['R',a],['T',le],['V',rs],['X',b]])put(curves,`${col}${i}`,x(row),row.distance);
    for(const [col,row] of [['S',a],['U',le],['W',rs],['Y',b]])put(curves,`${col}${i}`,target(row.id),row.measured+project.controls[row.id]);
    put(curves,`E${i}`,`(U${i}-S${i})/(T${i}-R${i})/1000`,c.m1);
    put(curves,`F${i}`,`(Y${i}-W${i})/(X${i}-V${i})/1000`,c.m2);
    put(curves,`C${i}`,`((W${i}-S${i})/1000+E${i}*R${i}-F${i}*V${i})/(E${i}-F${i})`,c.x);
    put(curves,`D${i}`,`S${i}/1000+E${i}*(C${i}-R${i})`,c.y);
    put(curves,`G${i}`,`ATAN(E${i})`,Math.atan(c.m1));put(curves,`H${i}`,`ATAN(F${i})`,Math.atan(c.m2));
    put(curves,`I${i}`,`SIGN(H${i}-G${i})`,c.sign);
    put(curves,`J${i}`,`B${i}*TAN(ABS(H${i}-G${i})/2)`,c.tangent);
    put(curves,`K${i}`,`C${i}-J${i}*COS(G${i})`,c.start);
    put(curves,`L${i}`,`C${i}+J${i}*COS(H${i})`,c.end);
    put(curves,`M${i}`,`D${i}-J${i}*SIN(G${i})`,c.startY);
    put(curves,`N${i}`,`K${i}-I${i}*B${i}*SIN(G${i})`,c.cx);
    put(curves,`O${i}`,`M${i}+I${i}*B${i}*COS(G${i})`,c.cy);
    put(curves,`Z${i}`,`AND(B${i}>0,B${i}<=10000000)`,true);
    put(curves,`AA${i}`,`ABS(H${i}-G${i})>1E-12`,true);
    put(curves,`AB${i}`,`AND(K${i}>=R${i}-1E-8,L${i}<=X${i}+1E-8)`,true);
    put(curves,`AC${i}`,k?`K${i}>=L${i-1}-1E-8`:'TRUE()',true);
    put(curves,`P${i}`,`AND(Z${i}:AC${i})`,true);
    put(curves,`Q${i}`,`B${i}*ABS(H${i}-G${i})`,c.length);
  });
  const slopes=book.addWorksheet('坡段计算');
  slopes.addRow(['坡段','起点序号','终点序号','起点距离 m','终点距离 m','起点设计 mm','终点设计 mm','坡段长度 m','高差 mm','坡度 ‰','每点递增 mm']);
  segments.forEach(([a,b],k)=>{const i=k+2,ya=a.measured+project.controls[a.id],yb=b.measured+project.controls[b.id];
    slopes.getCell(`A${i}`).value=k+1;slopes.getCell(`B${i}`).value=a.index+1;slopes.getCell(`C${i}`).value=b.index+1;
    put(slopes,`D${i}`,`(B${i}-1)*'参数'!$D$3`,a.distance);put(slopes,`E${i}`,`(C${i}-1)*'参数'!$D$3`,b.distance);
    put(slopes,`F${i}`,target(a.id),ya);put(slopes,`G${i}`,target(b.id),yb);
    put(slopes,`H${i}`,`E${i}-D${i}`,b.distance-a.distance);put(slopes,`I${i}`,`G${i}-F${i}`,yb-ya);
    put(slopes,`J${i}`,`I${i}/H${i}`,(yb-ya)/(b.distance-a.distance));put(slopes,`K${i}`,`I${i}/(C${i}-B${i})`,(yb-ya)/(b.index-a.index));
  });
  const steps=book.addWorksheet('测点竖曲线');
  steps.addRow(['记录序号','距离 m','查找曲线序号','位于圆弧内','半径 m','曲线起点 m','曲线终点 m','起点高程 m','圆心横坐标 m','方向 ±1','测点相对圆心 m','起点相对圆心 m','测点根式 m','起点根式 m','圆弧高差 m','圆弧高程 mm','最终设计 mm','全部曲线有效']);
  const inputs=book.addWorksheet('输入参数');
  inputs.getCell('A1').value='蓝色为参数输入；公式不锁定，可直接修改。修改前请另存备份。';
  inputs.getCell('A2').value='轨枕根数';inputs.getCell('B2').value=project.sleepers;
  put(params,'D2',"'输入参数'!B2",project.sleepers);
  inputs.getCell('B2').dataValidation=params.getCell('D2').dataValidation;
  inputs.getRow(5).values=['控制点记录序号','起道设置 mm（可改）','现场点号','实测高程 mm','控制点设计 mm',null,'竖曲线组合','半径 m（可改）'];
  for(const [id,i] of controls){const r=rows.find(r=>r.id===id);inputs.getCell(`A${i}`).value=r.index+1;inputs.getCell(`B${i}`).value=project.controls[id];put(inputs,`C${i}`,`'测量数据'!B${r.index+2}`,r.no);
    inputs.getCell(`B${i}`).dataValidation=params.getCell(`D${i}`).dataValidation;
    put(inputs,`D${i}`,`'测量数据'!F${r.index+2}`,r.measured);put(inputs,`E${i}`,`D${i}+B${i}`,r.measured+project.controls[id]);
    put(params,`D${i}`,`'输入参数'!B${i}`,project.controls[id]);
  }
  geometry.curves.forEach((c,k)=>{const i=k+6;inputs.getCell(`G${i}`).value=`坡段 ${c.leftIndex+1} → ${c.rightIndex+1}`;inputs.getCell(`H${i}`).value=c.radius;
    inputs.getCell(`H${i}`).dataValidation=curves.getCell(`B${k+2}`).dataValidation;put(curves,`B${k+2}`,`'输入参数'!H${i}`,c.radius);
  });
  for(const r of rows){
    const i=r.index+2;let expr=`'计算过程'!D${i}`;
    if(r.design!==null){
      if(geometry.curves.length){
        const last=geometry.curves.length+1;
        const active=geometry.curves.reduce((index,c,k)=>r.distance>=c.start?k+1:index,0),c=geometry.curves[Math.max(0,active-1)];
        const inside=active>0&&r.distance<=c.end,u=r.distance-c.cx,u0=c.start-c.cx;
        const q=Math.sqrt(Math.max(0,c.radius**2-u**2)),q0=Math.sqrt(Math.max(0,c.radius**2-u0**2));
        steps.getCell(`A${i}`).value=r.index+1;put(steps,`B${i}`,`'参数'!A${i}`,r.distance);
        put(steps,`C${i}`,`IFERROR(MATCH(B${i},'竖曲线参数'!$K$2:$K$${last},1),0)`,active);
        put(helper,`F${i}`,`'测点竖曲线'!C${i}`,active);
        for(const [col,source,value] of [['E','B',c.radius],['F','K',c.start],['G','L',c.end],['H','M',c.startY],['I','N',c.cx],['J','I',c.sign]])
          put(steps,`${col}${i}`,`INDEX('竖曲线参数'!$${source}$2:$${source}$${last},MAX(1,C${i}))`,value);
        put(steps,`D${i}`,`AND(C${i}>0,B${i}<=G${i})`,inside);
        put(steps,`K${i}`,`B${i}-I${i}`,u);put(steps,`L${i}`,`F${i}-I${i}`,u0);
        put(steps,`M${i}`,`SQRT(MAX(0,E${i}^2-K${i}^2))`,q);put(steps,`N${i}`,`SQRT(MAX(0,E${i}^2-L${i}^2))`,q0);
        put(steps,`O${i}`,`J${i}*(K${i}^2-L${i}^2)/(M${i}+N${i})`,c.sign*(u*u-u0*u0)/(q+q0));
        put(steps,`P${i}`,`(H${i}+O${i})*1000`,curveHeight(c,r.distance));
        put(steps,`R${i}`,`COUNTIF('竖曲线参数'!$P$2:$P$${last},FALSE)=0`,true);
        put(steps,`Q${i}`,`IF(R${i},IF(D${i},P${i},'计算过程'!D${i}),NA())`,r.design);
        put(main,`K${i}`,`IF('测点竖曲线'!D${i},'测点竖曲线'!E${i},"")`,r.radius??'');
        expr=`'测点竖曲线'!Q${i}`;
      }
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
    '可修改：测量数据前四列；输入参数 B2轨枕根数、B6起控制点起道量、H6起半径。蓝色为输入，其他公式也不锁定；修改前请另存备份。',
    '阅读顺序：输入参数 → 坡段计算 → 竖曲线参数 → 测点竖曲线 → 测量数据。公式分步说明表逐列解释计算含义，表头批注也可查看。',
    '修改公式建议从一行开始，核对结果后再在同一坡段内向下填充；不要跨坡段或覆盖未设计区。$表示固定引用，例如F$2固定第2行。重新从软件导出会生成新文件。',
    '坡段拓扑和控制点记录序号固定。增删记录、移动端点、增删坡段或竖曲线，请返回软件操作并重新导出。',
    '前后坡段各由两个测点确定，竖曲线交点由坡线延长计算；实际起道量以测量数据 J列为准。',
    '竖曲线参数 P列为FALSE表示越界、重叠、半径无效或两坡相同；设计结果显示#N/A，请调整后再使用。此项仅为几何检查，不代表符合规范。',
    '图表沿用导出时的显示范围和刻度。修改输入后系列随公式更新；如超出坐标范围，请在Excel/WPS中调整坐标轴。',
    '高程和起道量显示整毫米；坡度和递增量显示一位小数，公式保留完整精度。未设计区间保持空白坡线。',
    `测量日期：${project.measurementDate||'未填写'}；测量地点：${project.measurementLocation||'未填写'}。半径几何可用值不代表线路规范限值。`
  ].forEach(t=>{const row=guide.addRow([t]);row.height=40;row.alignment={wrapText:true,vertical:'middle'};});
  for(const address of ['B2',...[...controls.values()].map(i=>`B${i}`),...geometry.curves.map((c,k)=>`H${k+6}`)])inputs.getCell(address).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3F1FF'}};
  for(const address of ['D2',...[...controls.values()].map(i=>`D${i}`)])params.getCell(address).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6F7'}};
  const explanations=book.addWorksheet('公式分步说明');
  explanations.addRow(['工作表','计算列','中文说明','首行公式示例（文本）']);
  const describe=(sheet,texts)=>texts.forEach((text,k)=>{
    const cell=sheet.getCell(1,k+1),name=cell.value;
    cell.note=text;
    let sample='';sheet.getColumn(k+1).eachCell(c=>{if(!sample&&c.formula)sample='='+c.formula;});
    explanations.addRow([sheet.name,`${cell.address.replace(/1$/,'')} · ${name}`,text,sample]);
  });
  describe(helper,[
    '按记录顺序从1编号，不按现场点号排序。','首次等于首点前视；上点无后视时沿用仪器高，否则用上点实测加上点后视。',
    '相对仪器高减前视读数，未加统一基准。','直坡设计：起点设计加每点递增乘点数；连接区按交点高程及对应侧坡度延长。',
    '仅在起道量为负时给图表提供红点，其余为#N/A，属于有意隐藏图示点。','引用测点竖曲线表的匹配序号，0表示在首条曲线之前。',
    '从首测点累计的距离，等于（记录序号-1）乘测点间距。','两条坡线延长后的交点距离。','交点高程由米乘1000转为毫米。',
    '交点前采用前坡比，交点后采用后坡比；坡比为m/m。','本点距离减交点距离，前方为负，后方为正。']);
  describe(slopes,[
    '坡段顺序编号。','坡段起点记录序号，拓扑由软件导出。','坡段终点记录序号，拓扑由软件导出。','起点序号减1，再乘测点间距。','终点序号减1，再乘测点间距。',
    '引用输入参数中起点的实测高程加起道设置。','引用输入参数中终点的实测高程加起道设置。','终点距离减起点距离。','终点设计高程减起点设计高程。',
    '高差mm除以长度m，数值为千分坡度。','高差除以记录序号差，表示每个测点间隔的设计增量。']);
  describe(curves,[
    '本条曲线连接的两个坡段。','引用输入参数中的半径，单位米。','令前后直线高程相等，求得延长线交点距离。','前段起点高程加前坡比乘交点距离差，单位米。',
    '前坡高差由毫米转米，再除以前坡长度。','后坡高差由毫米转米，再除以后坡长度。','对前坡比取ATAN，得到弧度。','对后坡比取ATAN，得到弧度。',
    '后坡角减前坡角的符号：凹形+1、凸形-1。','半径乘两坡夹角一半的正切，得到沿切线方向的长度。','交点距离减切线长的水平投影。','交点距离加切线长的水平投影。',
    '交点高程减前侧切线长的竖向投影。','由曲线起点沿法线偏移半径，求圆心横坐标。','由曲线起点沿法线偏移半径，求圆心高程；用于核对。',
    '半径、坡差、范围及相邻曲线均有效才为TRUE；否则成果显示#N/A。','半径乘两坡角差绝对值，得到圆弧长度。',
    '前段起点距离，供本行短公式引用。','前段起点设计高程，单位毫米。','前段终点距离。','前段终点设计高程，单位毫米。',
    '后段起点距离。','后段起点设计高程，单位毫米。','后段终点距离。','后段终点设计高程，单位毫米。',
    '检查半径大于0且不超过软件输入上限。','检查两坡角不相同，避免平行线没有有限交点。','曲线头尾必须位于前后两段的外侧端点以内；容差1E-8米。','与前一条启用曲线不重叠；首条为TRUE。']);
  describe(steps,[
    '对应主表的记录序号。','引用本测点累计距离，单位米。','按曲线起点距离匹配最近的前方曲线；0表示尚未到达首条起点。',
    '已有匹配曲线且未超过其终点时为TRUE。','匹配曲线的半径。','匹配曲线的起点距离。','匹配曲线的终点距离。','匹配曲线的起点高程，单位米。',
    '匹配曲线的圆心横坐标。','匹配曲线的方向，凹+1、凸-1。','本点距离减圆心横坐标。','曲线起点距离减圆心横坐标。',
    '圆方程根式：半径平方减本点相对圆心距离平方，再开方。','圆方程根式：半径平方减起点相对圆心距离平方，再开方。',
    '相对起点的圆弧高差；用平方差除以根式之和，避免大半径时两个相近数直接相减损失精度。',
    '起点高程加圆弧高差，再由米转毫米；仅在D列为TRUE时用于成果。','圆弧内取P列，圆弧外取直坡设计；曲线几何无效时返回#N/A。','检查所有启用曲线的几何有效列，无FALSE才为TRUE。']);
  for(const [address,text] of Object.entries({B2:'输入每个测点间隔的轨枕根数；固定枕距0.6米。',B5:'控制点起道量，单位毫米；允许负值。',D5:'引用成果表的实测高程；读数变化时联动。',E5:'实测高程加设置起道量。可直接修改本列公式来改变控制点设计高程。',H5:'自定义竖曲线半径，单位米；此表不会自动选取半径或抬高坡线。'}))inputs.getCell(address).note=text;
  explanations.addRow(['输入参数','B2 / B6起 / H6起','依次为轨枕根数、控制点起道量、竖曲线半径；蓝色输入集中在此表。','']);
  explanations.addRow(['输入参数','D6起 / E6起','D引用实测；E=实测+起道设置，可修改公式。','=D6+B6']);
  describe(main,['现场特征文字，可改。','现场点号，可改；距离仍按记录顺序。','前视读数，单位整毫米。','后视读数，转站点填写，否则留空。','相对仪器高加统一基准。','仪器高减前视读数。','引用分步计算的最终设计高程；未设计时显示未设计。','本点到下一点的递增量除以间距，单位‰。','下一点设计高程减本点设计高程，单位mm。','设计高程减实测高程，负值红色显示。','在曲线内显示对应半径，其他位置留空。']);
  explanations.columns=[{width:20},{width:30},{width:85},{width:85}];explanations.getRow(1).height=30;
  explanations.eachRow((r,i)=>{r.height=i===1?30:48;r.alignment={vertical:'middle',wrapText:true};});
  explanations.views=[{state:'frozen',ySplit:1}];
  [helper,curves,slopes,steps,inputs].forEach(s=>{s.columns.forEach(c=>c.width=22);s.views=[{state:'frozen',ySplit:s===inputs?5:1}];s.getRow(1).height=40;s.getRow(1).alignment={wrapText:true,vertical:'middle'};s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A48'}};});
  inputs.getColumn(1).width=28;inputs.getColumn(7).width=28;inputs.mergeCells('A1:H1');
  [helper,curves,slopes,steps].forEach(sheet=>sheet.eachRow((row,i)=>{if(i>1)row.eachCell(cell=>{if(cell.formula)cell.numFmt='0.########';});}));
}
