import React,{useMemo} from 'react';
import {xrayTimeline,scanState} from './radiograph.js';
import './xray.css';

const KIND={bga:'BGA',bottom:'Bottom pad',leaded:'Leaded'};
const MODE={hidden:'Hidden joints',sample:'Sample · largest leaded ICs',none:'Nothing to X-ray'};

// X-ray results for the board: every inspected part's voids against its limit. The live image is on
// the operator computer in the 3D view; the part under the tube now is highlighted.
export default function Panel({plan,result,t}){
 const tl=useMemo(()=>xrayTimeline(plan),[plan]),ref=scanState(tl,t).ref;
 const rows=result?.xray||[],fails=rows.filter(r=>!r.pass).length;
 return <div className="f-xray">
  <div className="f-xray-head"><span>{MODE[plan.xrayMode]}</span><b className={fails?'fail':'pass'}>{rows.length?(fails?`${fails} over limit`:'All within limit'):'—'}</b></div>
  {rows.length>0&&<div className="table-scroll"><table className="f-xray-table" aria-label="X-ray results"><thead><tr><th>Part</th><th>Joints</th><th className="num-col">Voids</th><th className="num-col">Limit</th><th>Result</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.ref} className={r.ref===ref?'now':''}><td><strong>{r.ref}</strong><small className="price-note">{r.package}</small></td><td>{KIND[r.kind]}</td><td className="numeric">{r.voids.toFixed(1)}%</td><td className="numeric">{r.limit}%</td><td><span className={'badge '+(r.pass?'green':'red')}><span/>{r.pass?'Pass':'Fail'}</span></td></tr>)}</tbody></table></div>}
 </div>;
}
