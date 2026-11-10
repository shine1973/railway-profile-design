import {addFormulas} from './formulas.js';
import {curveGeometry,curveHeight} from '../src/vertical-curves.js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {HEADERS, parseRows, newProject, validateProject, calculate, format, designSegments} from '../src/core.js';

import {chartModel} from '../src/chart-view.js';

export async function exportTemplate() {
  const book = new ExcelJS.Workbook();
  book.creator = '线路拉坡';
  const sheet = book.addWorksheet('测量数据', {views:[{state:'frozen',ySplit:1}]});
  sheet.addRow(HEADERS);
  [28,16,20,20].forEach((width,i)=>{sheet.getColumn(i+1).width=width;});
  sheet.getRow(1).height=30;
  sheet.getRow(1).eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A48'}};
  });
  ['选填，如起点、岔心、终点','必填整数；允许负号、0、重复或不连续的现场点号','必填，原仪器站读数，单位 mm，填写整毫米','仅转站点填写：转站后复测本点的读数，单位 mm；普通点留空'].forEach((note,i)=>{sheet.getCell(1,i+1).note=note;});
  for(let r=2;r<=201;r++) {
    sheet.getRow(r).height=24;
    for(let c=1;c<=4;c++) {
      const cell=sheet.getCell(r,c);
      cell.border={bottom:{style:'hair',color:{argb:'FFDCE5E9'}}};
      if(c>1) {
        cell.numFmt='0';
        cell.dataValidation={type:'whole',operator:'between',allowBlank:true,formulae:[-2147483648,2147483647],showErrorMessage:true,errorStyle:'stop',errorTitle:'请填写整数',error:'点号填写整数，尺读数填写整毫米。'};
      }
    }
  }
  const guide=book.addWorksheet('填写说明');
  guide.columns=[{width:24},{width:24},{width:24},{width:24},{width:65}];
  const notes=[
    '测量数据填写说明',
    '在“测量数据”工作表第二行开始填写，每个实际测点一行，按现场测量顺序记录。预留200行，可继续向下填写。',
    '特征点选填；点号和前视读数必填。尺读数单位为 mm，填写整毫米数值，不填写公式或单位文字。',
    '转站时，在同一行填写原站的前视读数和新站复测该点的后视读数，不重复增加测点行。普通点后视读数留空。',
    '点号可以从负数或0开始，允许现场标号重复或不连续；软件按记录顺序及固定测点间距计算距离。',
    '轨枕间距固定0.6米，测点间隔的轨枕根数在软件内设置，默认为6根。无需填写绝对高程。',
    '下方仅为示例，不参与导入。“测量数据”表保持空白，填写后保存为 .xlsx 即可导入软件。'
  ];
  notes.forEach((text,i)=>{guide.mergeCells(i+1,1,i+1,5);guide.getCell(i+1,1).value=text;guide.getCell(i+1,1).alignment={vertical:'middle',wrapText:true};guide.getRow(i+1).height=i===0?30:38;});
  guide.getCell('A1').font={bold:true,size:16};
  // Example headings intentionally differ from the four import headings.
  guide.addRow(['特征说明（示例）','现场点号（示例）','前视读数（mm）','后视读数（mm）','说明']);
  guide.addRow(['起点',-2,1200,null,'本次测量的第一个点']);
  guide.addRow(['转站点',-1,1250,800,'原站读1250；转站后复测同一点读800，填在同一行']);
  guide.addRow(['',0,830,null,'新站继续测量下一个实际点']);
  guide.addRow(['终点',1,850,null,'普通点后视留空']);
  return book.xlsx.writeBuffer();
}

function cellValue(cell) {
  const v = cell.value;
  if (v && typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return {invalidFormula: true};
    if ('richText' in v) return v.richText.map(t => t.text).join('');
    if ('text' in v) return v.text;
  }
  return v;
}
export async function importWorkbook(buffer, name) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const candidates = [];
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > 20050 || sheet.columnCount > 1000) throw new Error('表格过大，请只保留测量数据后导入');
    const rows = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = [];
      for (let c = 1; c <= sheet.columnCount; c++) row.push(cellValue(sheet.getCell(r, c)));
      rows.push(row);
    }
    if (rows.some(r => ['特征点','点号','前视读数','后视读数'].every(h => r.some(v => String(v ?? '').trim() === h)))) candidates.push({name: sheet.name, rows});
  }
  if (!candidates.length) throw new Error('未找到四列原始数据表头。请检查 .xlsx 文件。');
  if (candidates.length > 1) throw new Error(`存在多个测量工作表：${candidates.map(c => c.name).join('、')}。请将本次测量单独保存后导入。`);
  const points=parseRows(candidates[0].rows);
  if(points.length>10000)throw new Error('测点超过10000，请分段导入');
  return newProject(points,name);
}

const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const ns = 'http://schemas.openxmlformats.org';
function numericRef(formula, data) {
  return `<c:numRef><c:f>${xml(formula)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${data.length}"/>${data.map((v,i) => v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
}
function rich(text,color='446774') {
  return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1000"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr><a:t>${xml(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}
function labels(items,position='t') {
  return `<c:dLbls>${items.map(({index,text,negative,formula})=>`<c:dLbl><c:idx val="${index}"/>${formula?`<c:tx><c:strRef><c:f>${xml(formula)}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(text)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`:rich(text,negative?'D4374F':'446774')}<c:dLblPos val="${position}"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbl>`).join('')}<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/></c:dLbls>`;
}
function series(i,name,color,rows,formula,values,{marker=false,annotations=[],negative=false,line=true,xFormula=null,xValues=null}={}) {
  const style=`<c:spPr><a:ln w="${i===1?23813:17145}">${line?`<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`:'<a:noFill/>'}</a:ln></c:spPr>`;
  const pointStyle=(fill,stroke,size)=>`<c:marker><c:symbol val="circle"/><c:size val="${size}"/><c:spPr><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="${stroke}"/></a:solidFill></a:ln></c:spPr></c:marker>`;
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${name}</c:v></c:tx>${style}${marker?pointStyle('FFFFFF',color,i===2?9:5):'<c:marker><c:symbol val="none"/></c:marker>'}${negative?rows.filter(r=>r.lift!==null&&r.lift<0).map(r=>`<c:dPt><c:idx val="${r.index}"/>${pointStyle('D4374F','D4374F',5)}</c:dPt>`).join(''):''}${annotations.length?labels(annotations):''}<c:xVal>${numericRef(xFormula??`'参数'!$B$2:$B$${rows.length+1}`,xValues??rows.map(r=>r.index+1))}</c:xVal><c:yVal>${numericRef(formula,values)}</c:yVal><c:smooth val="0"/></c:ser>`;
}
function layout(x,y,w,h,inner=false) {
  return `<c:layout><c:manualLayout>${inner?'<c:layoutTarget val="inner"/>':''}<c:xMode val="edge"/><c:yMode val="edge"/><c:wMode val="factor"/><c:hMode val="factor"/><c:x val="${x}"/><c:y val="${y}"/><c:w val="${w}"/><c:h val="${h}"/></c:manualLayout></c:layout>`;
}
function title(text,placement='') { return `${rich(text)}${placement}<c:overlay val="0"/>`; }
function axis(id,cross,pos,label,range,step) {
  return `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/><c:max val="${range.max}"/><c:min val="${range.min}"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/>${pos==='l'?'<c:majorGridlines/>':''}<c:title>${title(label,pos==='b'?layout(.44,.84,.2,.05):'')}</c:title><c:numFmt formatCode="0" sourceLinked="0"/><c:tickLblPos val="${pos==='b'?'none':'nextTo'}"/><c:crossAx val="${cross}"/><c:crosses val="min"/><c:crossBetween val="midCat"/><c:majorUnit val="${step}"/></c:valAx>`;
}
// Explicit sequence labels avoid Excel placing fractional ticks at the half-point margins.
function sequenceGrid(model) {
  const xs=[],ys=[],annotations=[];
  model.ticks.forEach(t=>{annotations.push({index:xs.length,text:String(t)});xs.push(t,t,null);ys.push(model.axis.min,model.axis.max,null);});
  const literal=data=>`<c:numLit><c:formatCode>0</c:formatCode><c:ptCount val="${data.length}"/>${data.map((v,i)=>v===null?'':`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numLit>`;
  return `<c:ser><c:idx val="3"/><c:order val="3"/><c:tx><c:v>坐标网格（辅助）</c:v></c:tx><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="EDF2F4"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${labels(annotations,'b')}<c:xVal>${literal(xs)}</c:xVal><c:yVal>${literal(ys)}</c:yVal><c:smooth val="0"/></c:ser>`;
}
export async function exportWorkbook(rawProject, options = {}) {
  const project = validateProject(rawProject), rows = calculate(project);
  if (!rows.length) throw new Error('请先导入测量数据');
  const geometry=curveGeometry(project,rows);
  if(geometry.issues.length)throw new Error(geometry.issues.join('\n'));
  const model=chartModel(rows,project.controls,options);
  const annotations=rows.filter(r=>r.index+1>=model.view.min&&r.index+1<=model.view.max).map(r=>({index:r.index,text:[options.labelNo?String(r.no):'',options.labelFeature!==false?r.feature:'',options.labelLift&&r.lift!==null?format(r.lift)+' mm':''].filter(Boolean).join(' · '),negative:r.lift!==null&&r.lift<0,formula:options.formulas?`'参数'!$R$${r.index+2}`:null})).filter(r=>r.text);
  const book = new ExcelJS.Workbook();
  book.creator = '线路拉坡'; book.created = new Date();
  const sheet = book.addWorksheet('测量数据', {views: [{state:'frozen',ySplit:1,xSplit:2}]});
  sheet.addRow(['特征点','点号','前视读数','后视读数','仪器高','实测高程','设计高程','坡度','递增量','起道量','竖曲线半径（m）']);
  for (const r of rows) {
    sheet.addRow([r.feature,r.no,r.fore,r.back,r.instrument,r.measured,r.design ?? '未设计',r.slope,r.increment,r.lift ?? '未设计',r.radius]);
  }
  sheet.getColumn('L').width=12;sheet.getColumn('M').width=16;sheet.getColumn('N').width=12;
  sheet.getCell('L1').value='测量日期';sheet.getCell('M1').value=project.measurementDate||'未填写';
  sheet.getCell('N1').value='测量地点';sheet.mergeCells('O1:AB1');sheet.getCell('O1').value=project.measurementLocation||'未填写';
  sheet.getCell('O1').alignment={vertical:'middle',horizontal:'left',wrapText:true};
  const widths = [24,12,14,14,16,19,16,12,14,14,18];
  widths.forEach((w,i) => {sheet.getColumn(i+1).width=w; if(i>0) sheet.getColumn(i+1).numFmt = i===7||i===8 ? '0.0' : '0';});
  sheet.getRow(1).height=30;
  sheet.getRow(1).alignment={vertical:'middle',horizontal:'center'};
  sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'},size:11};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A48'}};});
  sheet.eachRow((row,i)=>{if(i>1){row.height=23;row.eachCell(c=>{c.font={name:'Microsoft YaHei',size:11};c.alignment={vertical:'middle',horizontal:'center'};if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6F7'}};});}});
  rows.forEach((r,i)=>{if(!options.formulas && r.lift!==null && r.lift<0) sheet.getCell(i+2,10).font={color:{argb:'FFDC3545'},bold:true};});
  sheet.addConditionalFormatting({ref:`J2:J${rows.length+1}`,rules:[{type:'cellIs',operator:'lessThan',formulae:['0'],priority:1,style:{font:{color:{argb:'FFDC3545'},bold:true}}}]});
  sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
  const params = book.addWorksheet('参数');
  params.addRow(['累计距离（米）','记录序号','项目名称',project.name]);
  rows.forEach((r,i)=>{params.getCell(i+2,1).value=r.distance;params.getCell(i+2,2).value=i+1;});
  params.getCell('V1').value='测量日期';params.getCell('W1').value=project.measurementDate||'未填写';params.getCell('V2').value='测量地点';params.getCell('W2').value=project.measurementLocation||'未填写';
  params.getCell('C2').value='轨枕根数';params.getCell('D2').value=project.sleepers;
  params.getCell('C3').value='测点间距（米）';params.getCell('D3').value=project.sleepers*0.6;
  params.getCell('C4').value='首点假定高程（mm）';params.getCell('D4').value=rows[0].datum;
  sheet.getCell('E1').note='本行前视读数对应的仪器高。实测高程=仪器高-前视读数；若本行有后视，下一行仪器高=本行实测高程+后视读数。';
  params.getCell('C5').value='控制点记录序号';params.getCell('D5').value='设置起道量（mm）';
  let row=6;rows.forEach(r=>{if(Object.hasOwn(project.controls,r.id)){params.getCell(row,3).value=r.index+1;params.getCell(row++,4).value=project.controls[r.id];}});
  params.getCell('F1').value='图示实测高程';params.getCell('G1').value='图示设计高程';params.getCell('H1').value='控制点图示高程';
  rows.forEach((r,i)=>{
    params.getCell(i+2,6).value={formula:`'测量数据'!F${i+2}+$J$2`,result:r.measured+model.offset};
    if(r.design!==null)params.getCell(i+2,7).value={formula:`'测量数据'!G${i+2}+$J$2`,result:r.design+model.offset};
    if(Object.hasOwn(project.controls,r.id))params.getCell(i+2,8).value=r.measured+project.controls[r.id]+model.offset;
  });
  params.getCell('J1').value='图示高程额外偏移（mm）';params.getCell('J2').value=model.offset;
  params.getCell('J3').value='导出记录序号范围';params.getCell('K3').value=model.view.min;params.getCell('L3').value=model.view.max;
  params.getCell('J4').value='纵轴最小/最大/刻度';params.getCell('K4').value=model.axis.min;params.getCell('L4').value=model.axis.max;params.getCell('M4').value=model.axis.step;
  // Insert blank chart-only points between disconnected segments, including
  // adjacent endpoints where the main result table has no blank row.
  const designPoints=[];
  rows.forEach((r,i)=>{
    const previous=rows[i-1];
    if(previous&&previous.design!==null&&r.design!==null&&previous.slope===null)designPoints.push({sequence:i+.5,value:null,row:null});
    designPoints.push({sequence:i+1,value:r.design===null?null:r.design+model.offset,row:i+2});
  });
  params.getCell('N1').value='设计图记录序号';params.getCell('O1').value='分段设计图高程';
  designPoints.forEach((p,i)=>{params.getCell(i+2,14).value=p.sequence;if(p.value!==null)params.getCell(i+2,15).value={formula:`'测量数据'!G${p.row}+$J$2`,result:p.value};});
  params.getCell('P1').value='坡段起点序号';params.getCell('Q1').value='坡段终点序号';
  designSegments(project).forEach(([a,b],i)=>{params.getCell(i+2,16).value=rows.find(r=>r.id===a).index+1;params.getCell(i+2,17).value=rows.find(r=>r.id===b).index+1;});
  params.columns.forEach(c=>c.width=25);
  if(options.formulas)addFormulas(book,project,rows,model,options);
  else if(geometry.curves.length){const curveSheet=book.addWorksheet('竖曲线参数');curveSheet.addRow(['前后坡段','半径 m','起点距离 m','终点距离 m','弧长 m']);geometry.curves.forEach(c=>curveSheet.addRow([`坡段 ${c.leftIndex+1} → ${c.rightIndex+1}`,c.radius,c.start,c.end,c.length]));curveSheet.columns.forEach(c=>c.width=22);}

  params.getCell('T1').value='竖曲线端点序号';params.getCell('U1').value='竖曲线端点图示高程';
  const curveEnds=geometry.curves.flatMap((c,k)=>[[c.start,'起点'],[c.end,'终点']].map(([distance,name],end)=>({c,k,end,distance,name:`竖曲线${name} ${k+1}`,sequence:distance/(project.sleepers*.6)+1,value:curveHeight(c,distance)+model.offset})));
  curveEnds.forEach((p,k)=>{const i=k+2,j=p.k+2,col=p.end?'L':'K';params.getCell(`T${i}`).value=options.formulas?{formula:`'竖曲线参数'!${col}${j}/$D$3+1`,result:p.sequence}:p.sequence;params.getCell(`U${i}`).value=options.formulas?{formula:`('竖曲线参数'!D${j}+'竖曲线参数'!${p.end?'F':'E'}${j}*('竖曲线参数'!${col}${j}-'竖曲线参数'!C${j}))*1000+$J$2`,result:p.value}:p.value;});
  const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
  const measuredFormula=(model.offset||options.formulas)?`'参数'!$F$2:$F$${rows.length+1}`:`'测量数据'!$F$2:$F$${rows.length+1}`;
  const designFormula=`'参数'!$O$2:$O$${designPoints.length+1}`;
  const chartTitle=options.formulas?`<c:tx><c:strRef><c:f>'参数'!$S$2</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(model.offset?`纵断面对比（图示高程额外偏移 +${model.offset} mm）`:'纵断面对比')}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:overlay val="0"/>`:title('纵断面对比'+(model.offset?`（图示高程额外偏移 +${model.offset} mm）`:''));
  const chart=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${ns}/drawingml/2006/chart" xmlns:a="${ns}/drawingml/2006/main"><c:lang val="zh-CN"/><c:chart><c:title>${chartTitle}</c:title><c:plotArea>${layout(.1,.16,.85,.6,true)}<c:scatterChart><c:scatterStyle val="lineMarker"/>${series(0,'实测','27899A',rows,measuredFormula,rows.map(r=>r.measured+model.offset),{marker:true,annotations,negative:!options.formulas})}${series(1,'设计','DF9E3D',rows,designFormula,designPoints.map(p=>p.value),{xFormula:`'参数'!$N$2:$N$${designPoints.length+1}`,xValues:designPoints.map(p=>p.sequence)})}${series(2,'控制点','D99432',rows,`'参数'!$H$2:$H$${rows.length+1}`,rows.map(r=>Object.hasOwn(project.controls,r.id)?r.measured+project.controls[r.id]+model.offset:null),{marker:true,line:false})}${sequenceGrid(model)}${options.formulas?series(4,'负起道量','D4374F',rows,`'计算过程'!$E$2:$E$${rows.length+1}`,rows.map(r=>r.lift!==null&&r.lift<0?r.measured+model.offset:null),{marker:true,line:false}):''}${curveEnds.length?series(options.formulas?5:4,'竖曲线起终点','DF9E3D',rows,`'参数'!$U$2:$U$${curveEnds.length+1}`,curveEnds.map(p=>p.value),{marker:true,line:false,xFormula:`'参数'!$T$2:$T$${curveEnds.length+1}`,xValues:curveEnds.map(p=>p.sequence),annotations:options.labelFeature!==false?curveEnds.map((p,index)=>({index,text:p.name})):[]}):''}<c:axId val="100"/><c:axId val="200"/></c:scatterChart>${axis(100,200,'b','记录序号',model.view,1)}${axis(200,100,'l','图示高程（mm）',model.axis,model.axis.step)}</c:plotArea><c:legend><c:legendPos val="b"/><c:legendEntry><c:idx val="3"/><c:delete val="1"/></c:legendEntry>${layout(.3,.92,.4,.05)}<c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  zip.file('xl/charts/chart1.xml',chart);
  zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${ns}/drawingml/2006/spreadsheetDrawing" xmlns:a="${ns}/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>11</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>28</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="纵断面对比图"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${ns}/drawingml/2006/chart"><c:chart xmlns:c="${ns}/drawingml/2006/chart" xmlns:r="${ns}/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
  const rel=(type,target)=>`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
  zip.file('xl/drawings/_rels/drawing1.xml.rels',rel('chart','../charts/chart1.xml'));
  const sheetRelsPath='xl/worksheets/_rels/sheet1.xml.rels';
  const existingRels=zip.file(sheetRelsPath)?await zip.file(sheetRelsPath).async('string'):`<?xml version="1.0"?><Relationships xmlns="${ns}/package/2006/relationships"></Relationships>`;
  zip.file(sheetRelsPath,existingRels.replace('</Relationships>',`<Relationship Id="rIdProfileChart" Type="${ns}/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`));
  const sx=await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml',sx.replace('</worksheet>','<drawing r:id="rIdProfileChart"/></worksheet>'));
  const ct=await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml',ct.replace('</Types>','<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
