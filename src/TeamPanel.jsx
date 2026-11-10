import React,{useEffect,useState} from 'react';
import {Trash2} from 'lucide-react';

// The admin's team list: every account, and members can be removed. The admin account is fixed.
export default function TeamPanel({notify}){
 const [users,setUsers]=useState(null),[busy,setBusy]=useState('');
 const call=async(path,email)=>{setBusy(email||'load');
  try{const r=await fetch(path,email?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}:undefined);const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||'Request failed.');setUsers(j.users);return true}
  catch(e){notify?.(e.message);return false}finally{setBusy('')}};
 useEffect(()=>{call('/api/auth/users')},[]);// eslint-disable-line react-hooks/exhaustive-deps
 if(!users)return <p className="muted">Loading…</p>;
 const sorted=[...users].sort((a,b)=>(a.role==='admin'?-1:b.role==='admin'?1:0)||a.name.localeCompare(b.name));
 return <div className="team">
  <div className="table-scroll"><table className="team-table" aria-label="Team accounts"><thead><tr><th>Name</th><th>Role</th><th>Joined</th><th aria-label="Actions"/></tr></thead>
   <tbody>{sorted.map(u=><tr key={u.email}><td><strong>{u.name}</strong><small className="price-note">{u.email}</small></td><td>{u.role==='admin'?'Admin':'Member'}</td>
    <td className="numeric">{u.created?new Date(u.created).toLocaleDateString():'—'}</td>
    <td className="team-actions">{u.role!=='admin'&&<button type="button" className="button small" disabled={!!busy} aria-label={`Remove ${u.email}`} onClick={async()=>{if(confirm(`Remove ${u.name} (${u.email})?`)&&await call('/api/auth/remove',u.email))notify?.(`${u.name} removed`)}}><Trash2 size={14}/>Remove</button>}</td></tr>)}</tbody></table></div>
  {users.length===1&&<p className="muted team-note">No other accounts yet.</p>}
 </div>;
}
