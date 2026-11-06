const fs=require('node:fs'),vm=require('node:vm'),{createCanvas}=require('@napi-rs/canvas');
const root=require('node:path').resolve(__dirname,'..');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(root+'/SmartDiveAuth/Web/display.js','utf8').replace('export function drawCockpit','function drawCockpit'),context);
const canvas=createCanvas(1152,576),ctx=canvas.getContext('2d');ctx.scale(2,2);
context.drawCockpit(ctx,{header:'11/30 08:00 | JP 12/01 01:00',title:'Dashboard / Next up',position:'3 reserved | 8 favorites',content:'>> Next: DEMO101 [R]\n11-30 08:30 MGM\nBuild your next AI\n   Walk-up: DEMO202\n11-30 09:00 VEN\nExplore cloud concepts\n   Change venue: VEN',footer:'Up/Down: Action | Tap: Select | 2Tap: Menu',venue:{code:'VEN',kind:'Your venue'}},{tab:0,focusTab:0,focus:'content'});
fs.writeFileSync(root+'/SmartDiveAuth/Web/cockpit-guide.png',canvas.toBuffer('image/png'));
