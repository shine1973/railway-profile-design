import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {parseRows, newProject, validateProject, calculate} from '../src/core.js';

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
    if (sheet.rowCount > 10050 || sheet.columnCount > 1000) throw new Error('表格过大，请只保留测量数据后导入');
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
  return newProject(parseRows(candidates[0].rows), name);
}

const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const ns = 'http://schemas.openxmlformats.org';
function numericRef(formula, data) {
  return `<c:numRef><c:f>${xml(formula)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${data.length}"/>${data.map((v,i) => v === null ? '' : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef>`;
}
function series(i, name, color, rows, field, col) {
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${name}</c:v></c:tx><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker><c:xVal>${numericRef(`'参数'!$A$2:$A$${rows.length+1}`,rows.map(r=>r.distance))}</c:xVal><c:yVal>${numericRef(`'测量数据'!$${col}$2:$${col}$${rows.length+1}`, rows.map(r=>r[field]))}</c:yVal><c:smooth val="0"/></c:ser>`;
}
function title(text) { return `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN"/><a:t>${xml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`; }
function axis(id, cross, pos, label) {
  return `<c:valAx><c:axId val="${id}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${pos}"/><c:majorGridlines/><c:title>${title(label)}</c:title><c:numFmt formatCode="0.0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${cross}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
}
export async function exportWorkbook(rawProject) {
  const project = validateProject(rawProject), rows = calculate(project);
  if (!rows.length) throw new Error('请先导入测量数据');
  const book = new ExcelJS.Workbook();
  book.creator = '线路拉坡'; book.created = new Date();
  const sheet = book.addWorksheet('测量数据', {views: [{state:'frozen',ySplit:1,xSplit:2}]});
  sheet.addRow(['特征点','点号','前视读数','后视读数','实测相对高程','设计高程','坡度','递增量','起道量']);
  for (const r of rows) {
    sheet.addRow([r.feature,r.no,r.fore,r.back,r.measured,r.design ?? '未设计',r.slope,r.increment,r.lift ?? '未设计']);
  }
  const widths = [24,12,14,14,19,16,12,14,14];
  widths.forEach((w,i) => {sheet.getColumn(i+1).width=w; if(i>0) sheet.getColumn(i+1).numFmt = i===6||i===7 ? '0.0' : '0';});
  sheet.getRow(1).height=30;
  sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'},size:11};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173A48'}};});
  sheet.eachRow((row,i)=>{if(i>1){row.height=23;row.eachCell(c=>{c.font={name:'Microsoft YaHei',size:11};c.alignment={vertical:'middle'};if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F6F7'}};});}});
  rows.forEach((r,i)=>{if(r.lift!==null && r.lift<0) sheet.getCell(i+2,9).font={color:{argb:'FFDC3545'},bold:true};});
  sheet.addConditionalFormatting({ref:`I2:I${rows.length+1}`,rules:[{type:'cellIs',operator:'lessThan',formulae:['0'],priority:1,style:{font:{color:{argb:'FFDC3545'},bold:true}}}]});
  sheet.autoFilter={from:'A1',to:`I${rows.length+1}`};
  sheet.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
  const params = book.addWorksheet('参数');
  params.addRow(['累计距离（米）','记录序号','项目名称',project.name]);
  rows.forEach((r,i)=>{params.getCell(i+2,1).value=r.distance;params.getCell(i+2,2).value=i+1;});
  params.getCell('C2').value='轨枕根数';params.getCell('D2').value=project.sleepers;
  params.getCell('C3').value='测点间距（米）';params.getCell('D3').value=project.sleepers*0.6;
  params.getCell('C5').value='控制点记录序号';params.getCell('D5').value='设置起道量（mm）';
  let row=6;rows.forEach(r=>{if(Object.hasOwn(project.controls,r.id)){params.getCell(row,3).value=r.index+1;params.getCell(row++,4).value=project.controls[r.id];}});
  params.columns.forEach(c=>c.width=25);
  const zip=await JSZip.loadAsync(await book.xlsx.writeBuffer());
  const chart=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${ns}/drawingml/2006/chart" xmlns:a="${ns}/drawingml/2006/main"><c:lang val="zh-CN"/><c:chart><c:title>${title('实测高程与设计高程对比')}</c:title><c:plotArea><c:layout/><c:scatterChart><c:scatterStyle val="line"/>${series(0,'实测高程','27899A',rows,'measured','E')}${series(1,'设计高程','E99D36',rows,'design','F')}<c:axId val="100"/><c:axId val="200"/></c:scatterChart>${axis(100,200,'b','累计距离（米）')}${axis(200,100,'l','相对高程（mm）')}</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  zip.file('xl/charts/chart1.xml',chart);
  zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${ns}/drawingml/2006/spreadsheetDrawing" xmlns:a="${ns}/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>10</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>27</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>25</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="纵断面对比图"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${ns}/drawingml/2006/chart"><c:chart xmlns:c="${ns}/drawingml/2006/chart" xmlns:r="${ns}/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
  const rel=(type,target)=>`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
  zip.file('xl/drawings/_rels/drawing1.xml.rels',rel('chart','../charts/chart1.xml'));
  zip.file('xl/worksheets/_rels/sheet1.xml.rels',rel('drawing','../drawings/drawing1.xml'));
  const sx=await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml',sx.replace('</worksheet>','<drawing r:id="rId1"/></worksheet>'));
  const ct=await zip.file('[Content_Types].xml').async('string');
  zip.file('[Content_Types].xml',ct.replace('</Types>','<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>'));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
