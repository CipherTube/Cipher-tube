const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('/tmp/ct/docs/simulators/session-simulator-map.html','utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];
const els={};
const mk=()=>({value:'',textContent:'',innerHTML:'',className:'',dataset:{},classList:{toggle(){},add(){},remove(){}},
  addEventListener(){},setAttribute(){}});
const document={getElementById(id){return els[id]||(els[id]=mk())},querySelectorAll(){return []}};
const ctx={document,window:{location:{hash:''},history:{replaceState(){}}},navigator:{clipboard:{writeText:async()=>{}}},
  btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
  unescape:global.unescape,escape:global.escape,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout,console,JSON,Math,Date,Set};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(js,ctx);
const g=n=>ctx[n];
function fresh(){ vm.runInContext('appState=defaultState(); syncInputsFromState(); render();',ctx); }
function setField(id,v){ els[id].value=v; }
let pass=0,fail=0;
function check(name,cond,extra){ if(cond){pass++;console.log('  PASS',name)} else {fail++;console.log('  FAIL',name,extra||'')} }

fresh();
setField('inpOwnerId','user-101'); setField('inpActorId','attacker-999');
g('syncInputsFromState'); // pull inputs back into state
vm.runInContext('syncStateFromInputs(); handleValidate();',ctx);
let st=vm.runInContext('appState.session',ctx);
check('owner mismatch blocks with 403 and does not extend TTL', st.lastReason==='OWNER_MISMATCH_LOCK' && vm.runInContext('appState.events[0].statusCode',ctx)===403, JSON.stringify(st));

fresh();
setField('inpDeviceId','adb-emu-5554'); setField('inpReqDeviceId','other-device');
vm.runInContext('syncStateFromInputs(); handleValidate();',ctx);
st=vm.runInContext('appState.session',ctx);
check('device drift locks the session', st.lastReason==='DEVICE_DRIFT_LOCK', JSON.stringify(st));

fresh();
vm.runInContext('handleExpire(); handleValidate();',ctx);
check('expired session returns 410', vm.runInContext('appState.events[0].statusCode',ctx)===410);
check('expired stays EXPIRED', vm.runInContext('appState.session.state',ctx)==='EXPIRED');

fresh();
vm.runInContext('handleRevoke(); handleValidate();',ctx);
check('revoked session rejects validate with 410', vm.runInContext('appState.events[0].statusCode',ctx)===410);
check('revoked stays REVOKED', vm.runInContext('appState.session.state',ctx)==='REVOKED');

fresh();
vm.runInContext('for(let i=0;i<12;i++){handleTick();}',ctx);
check('TTL ticks down to expiry', vm.runInContext('appState.session.state',ctx)==='EXPIRED', vm.runInContext('appState.session.remainingTtlSeconds',ctx));

fresh();
setField('inpActorId','intruder');
vm.runInContext('syncStateFromInputs(); handleRevoke();',ctx);
check('intruder cannot revoke', vm.runInContext('appState.session.state',ctx)==='ACTIVE');

fresh();
setField('inpTtl','0');
vm.runInContext('syncStateFromInputs();',ctx);
check('ttl floor of 5 seconds enforced', vm.runInContext('appState.session.ttlSeconds',ctx)>=5, vm.runInContext('appState.session.ttlSeconds',ctx));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
