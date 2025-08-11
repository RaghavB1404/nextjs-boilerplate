// app/components/Dag.tsx
'use client';
export default function Dag(props:{ passActions:number; failActions:number; took?:string; trace?:'onPass'|'onFail'|null }) {
  const { passActions, failActions, trace } = props;
  const edge = (active:boolean)=> active ? 'stroke-green-600' : 'stroke-gray-300';
  const edgeFail = (active:boolean)=> active ? 'stroke-red-600' : 'stroke-gray-300';
  return (
    <svg viewBox="0 0 420 120" className="w-full h-28">
      {/* Node: PDP Check */}
      <rect x="10" y="30" width="140" height="60" rx="12" className="fill-white stroke-gray-400" />
      <text x="80" y="65" textAnchor="middle" className="text-[12px] fill-black">PDP Check</text>

      {/* onPass edge */}
      <line x1="150" y1="45" x2="290" y2="45" className={`${edge(trace==='onPass')} stroke-[3]`} />
      <text x="220" y="38" textAnchor="middle" className="text-[11px] fill-gray-600">onPass</text>
      {/* onFail edge */}
      <line x1="150" y1="75" x2="290" y2="75" className={`${edgeFail(trace==='onFail')} stroke-[3]`} />
      <text x="220" y="98" textAnchor="middle" className="text-[11px] fill-gray-600">onFail</text>

      {/* Node: Actions */}
      <rect x="290" y="20" width="120" height="80" rx="12" className="fill-white stroke-gray-400" />
      <text x="350" y="50" textAnchor="middle" className="text-[11px] fill-black">Actions</text>
      <text x="350" y="70" textAnchor="middle" className="text-[10px] fill-gray-600">
        {passActions} pass / {failActions} fail
      </text>
    </svg>
  );
}
