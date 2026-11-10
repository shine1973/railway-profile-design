// Generate documentation images from synthetic demo data only.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const pause=()=>new Promise(r=>setTimeout(r,160));
app.whenReady().then(async()=>{
 try{
  const w=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{sandbox:true}});
  await w.loadFile(path.join(__dirname,'../src/index.html'));
  const js=code=>w.webContents.executeJavaScript(code);
  await js(`document.getElementById('demo').click()`);await pause();
  const dir=path.join(__dirname,'../src/manual/images');await fs.mkdir(dir,{recursive:true});
  const capture=async(name,selector)=>{
   await pause();
   const rect=selector?await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`):{x:0,y:0,width:1420,height:720};
   await fs.writeFile(path.join(dir,name+'.png'),(await w.webContents.capturePage(rect)).toPNG());
  };
  await capture('overview');
  await js(`document.querySelector('[data-select="p1"]').click()`);
  await capture('pending','.workspace');
  await js(`for(const id of ['p20','p26','p42'])document.querySelector('[data-select="'+id+'"]').click()`);
  await capture('segments','.workspace');
  await js(`var input=document.querySelector('[data-lift="p1"]');input.value='20';input.dispatchEvent(new Event('change'));document.querySelector('[data-lift="p1"]').focus()`);
  await capture('lift','.workspace');
  await js(`document.querySelector('.tablecard').scrollIntoView();document.querySelector('td[data-key="fore"]').click()`);await pause();
  await fs.writeFile(path.join(dir,'table.png'),(await w.webContents.capturePage({x:24,y:0,width:1377,height:410})).toPNG());
  console.log('Generated 5 manual images using synthetic demo data');app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
