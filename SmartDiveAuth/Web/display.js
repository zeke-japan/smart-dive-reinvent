// One pixel geometry shared by the Web preview and the G2 image tiles.
export function drawCockpit(ctx,f,state){
 const ink='#fff',muted='#aaa';
 const hand=(x,y)=>{ctx.save();ctx.translate(x,y);ctx.fillStyle=ink;ctx.beginPath();[[0,-3],[4,-3],[4,-6],[7,-6],[7,-4],[17,-4],[19,-2],[17,0],[11,0],[13,2],[12,5],[9,7],[4,7],[2,4],[0,4]].forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fill();ctx.restore();};
 const txt=(s,x,y,size=13,color=ink)=>{ctx.fillStyle=color;ctx.font=`${size}px "DejaVu Sans Mono", Menlo, monospace`;String(s).split('\n').forEach((l,i)=>ctx.fillText(l,x,y+i*24));};
 const line=(points,color=muted)=>{ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x+.5,y+.5):ctx.moveTo(x+.5,y+.5));ctx.stroke();};
 ctx.fillStyle='#000';ctx.fillRect(0,0,576,288);
 ctx.strokeStyle=muted;ctx.lineWidth=1;ctx.strokeRect(.5,.5,575,287);
 line([[0,30],[576,30]]);line([[0,257],[576,257]]);line([[99,30],[99,257]]);line([[351,30],[351,257]]);
 txt(f.header,9,20,14);txt('SMART DIVE',474,20,12,muted);
 txt('MENU',9,50,11,muted);
 ['Home','Schedule','Find','Refresh'].forEach((label,i)=>{const y=83+i*40,active=state.tab===i;
  if(active&&state.focus!=='menu'){ctx.strokeStyle=ink;ctx.strokeRect(5.5,y-18.5,87,28);}
  if(state.focus==='menu'&&(state.focusTab??state.tab)===i)hand(8,y-4);
  txt(label,31,y,12);
 });

 ctx.save();ctx.beginPath();ctx.rect(108,35,234,213);ctx.clip();
 txt(f.title,109,50,12);txt(f.position,109,68,11,muted);
 String(f.content).split('\n').forEach((row,i)=>{
  if(row.startsWith('>>')){hand(109,87+i*24);txt(row.slice(3),132,91+i*24,13);}else txt(row,109,91+i*24,13);
 });ctx.restore();
 txt(f.footer,9,276,12);
 // Campus overview, north up: Strip bends northeast at Sands Avenue.
 ctx.save();ctx.translate(358,37);
 txt('MAP',1,12,11,muted);txt('N ^',181,12,11,muted);
 line([[82,204],[82,94],[125,20]],'#bbb');
 line([[85,204],[85,95],[128,20]],'#bbb');
 line([[8,96],[81,96],[139,96],[208,96]],'#666');
 line([[8,154],[82,154],[205,154]],'#666');
 line([[118,54],[165,73],[208,73]],'#666');
 const places=[
  ['WYN','Encore',[[138,20],[199,20],[199,36],[166,41],[130,36]],[166,32]],
  ['WYN','Wynn',[[130,39],[167,44],[161,62],[117,58]],[147,53]],
  ['VEN','Venetian',[[115,61],[156,76],[156,91],[96,91]],[129,84]],
  ['CF','Forum',[[159,94],[208,94],[208,112],[156,112]],[182,107]],
  ['CP','Palace',[[29,100],[77,100],[77,129],[40,129],[29,119]],[53,118]],
  ['MGM','MGM',[[91,168],[146,168],[146,188],[137,197],[91,197]],[117,186]],
 ];
 for(const [code,label,pts,pos]of places){const active=code===f.venue.code;
  ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
  if(active){ctx.fillStyle=ink;ctx.fill();}ctx.strokeStyle=ink;ctx.lineWidth=1;ctx.stroke();
  ctx.font=(code==='VEN'?'10':'12')+'px "DejaVu Sans Mono", Menlo, monospace';ctx.textAlign='center';ctx.fillStyle=active?'#000':ink;
  ctx.fillText(label,pos[0],pos[1]);ctx.textAlign='left';
 }
 txt('STRIP',27,184,10,muted);
 ctx.restore();
 txt(f.venue.code+' / '+(f.venue.kind||'Venue'),361,247,11);
}
