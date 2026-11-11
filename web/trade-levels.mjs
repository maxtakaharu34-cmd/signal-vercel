const MAX_LINES = 20;
const TITLES = {limit:'指値',stop:'逆指値',position:'建玉'};
const COLORS = {buy:'#9d2938',sell:'#245b8b',mixed:'#52606d'};

export function tradeLevels({positions,pending},{orderLines=true,positionLines=true}={}) {
 const entries = [];
 if (orderLines) {
  for (const order of pending) {
   if (order.status==='pending') entries.push({id:order.id,kind:order.type,side:order.side,price:order.target,time:order.time});
  }
 }
 if (positionLines) {
  for (const position of positions) {
   if (!position.close) entries.push({id:position.id,kind:'position',side:position.side,price:position.open.price,time:position.open.time});
  }
 }
 const grouped=new Map();
 for(const entry of entries.sort((a,b)=>b.time-a.time)){
  const id='trade:'+entry.price.toFixed(3);
  const existing=grouped.get(id);
  if(existing){
   existing.ids.push(entry.id);
   existing.color=COLORS.mixed;
   existing.title='取引 '+existing.ids.length+'件';
  }else if(grouped.size<MAX_LINES){
   const title=TITLES[entry.kind]+' '+(entry.side==='buy'?'買':'売');
   grouped.set(id,{id,ids:[entry.id],price:entry.price,color:COLORS[entry.side],title,kind:entry.kind});
  }
 }
 return [...grouped.values()];
}
