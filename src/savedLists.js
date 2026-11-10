// Saved BOM lists: a snapshot of the whole BOM tool (PCB, components, enclosure, mould, shipping and
// pricing) that can be reopened later exactly as it was. Kept in this browser, newest first.
export const LISTS_STORE='semicobot-saved-lists-v1';
export const BOM_STORE='semicobot-bom-tool-v1';
export const LIST_STATUSES=['draft','quoted','ordered','archived'];
const MAX_LISTS=40;

export function loadLists(){try{const v=JSON.parse(localStorage.getItem(LISTS_STORE));return Array.isArray(v)?v.filter(x=>x&&x.id&&x.state):[]}catch{return []}}
function store(lists){try{localStorage.setItem(LISTS_STORE,JSON.stringify(lists.slice(0,MAX_LISTS)));return true}catch{return false}}

// The figures shown in the list without opening it.
export function listSummary(state,totals={}){
 return {name:String(state.project||state.from||'Untitled BOM').slice(0,80),customer:String(state.customer||'').slice(0,80),boards:state.boards||0,lines:(state.rows||[]).length,
  pcb:!!state.pcb?.material,enclosure:state.box?.material?(state.box.kind==='custom'?'custom moulded':'off the shelf'):'',total:Number.isFinite(totals.customerTotal)?totals.customerTotal:null};
}

// Save (or update, when the state carries the id of a saved list) and return {lists, entry} or null when storage is full.
export function saveList(state,totals,{status='quoted',jobId=null,now=new Date().toISOString()}={}){
 const lists=loadLists();const id=state.listId&&lists.some(l=>l.id===state.listId)?state.listId:'list-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
 const old=lists.find(l=>l.id===id);
 const snapshot={...state,listId:id,demo:undefined};
 const entry={id,...listSummary(snapshot,totals),status,jobId:jobId||old?.jobId||null,createdAt:old?.createdAt||now,savedAt:now,revision:(old?.revision||0)+1,state:snapshot};
 const next=[entry,...lists.filter(l=>l.id!==id)];
 return store(next)?{lists:next,entry}:null;
}
export function removeList(id){const next=loadLists().filter(l=>l.id!==id);store(next);return next}
export function setListStatus(id,status){const next=loadLists().map(l=>l.id===id?{...l,status}:l);store(next);return next}
// A copy for a new quantity or customer: same content, new id, back to draft.
export function duplicateList(id,now=new Date().toISOString()){
 const lists=loadLists(),src=lists.find(l=>l.id===id);if(!src)return lists;
 const nid='list-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
 const copy={...src,id:nid,name:(src.name+' (copy)').slice(0,80),status:'draft',jobId:null,createdAt:now,savedAt:now,revision:1,state:{...src.state,listId:nid,project:(src.state.project||src.name)+' (copy)'}};
 const next=[copy,...lists];store(next);return next;
}
// Put a saved list into the BOM tool; it loads it the next time it opens.
export function openList(id){const l=loadLists().find(x=>x.id===id);if(!l)return false;try{localStorage.setItem(BOM_STORE,JSON.stringify({...l.state,listId:l.id}));return true}catch{return false}}
