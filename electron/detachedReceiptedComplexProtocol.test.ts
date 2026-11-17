import { describe, expect, it } from 'vitest';
import { isDetachedWriterRequest, isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const record={id:'s1',value:'{"id":"s1"}',expectedUpdatedAt:'v1'};
const task={id:'t1',value:'{"id":"t1"}',expectedUpdatedAt:'v1'};
const close={ownerId:'owner-a',payload:{module:'comite',session:record,tasks:[task],acta:null}};
const history={ownerId:'owner-a',payload:{module:'paritaria',
  tasks:[{id:'t1',externalKey:'task-1',value:'{"id":"t1"}'}],
  sessions:[{id:'s1',externalKey:'session-1',value:'{"id":"s1"}',taskExternalKeys:['task-1']}]}};
const coordination={ownerId:'owner-a',operation:'close',payload:{
  meeting:{key:'meeting',value:'{}',expectedUpdatedAt:'v1'},
  index:{key:'index',value:'{}',expectedUpdatedAt:'v1'},
  tasks:[task],
}};
describe('PR488 · protocolo de flujos atómicos con recibo', () => {
  for(const [kind,response,payload,result] of [
    ['close-session-atomically','session-closed-atomically',close,{ok:true,message:'ok',status:{ready:true}}],
    ['import-session-history','session-history-imported',history,
      {ok:true,message:'ok',status:{ready:true},importedSessionCount:1,createdTaskCount:1}],
    ['coordination-workflow','coordination-workflow-done',coordination,
      {ok:true,message:'ok',status:{ready:true}}],
  ] as const) {
    it('valida '+kind+' e impide una generación o UUID ajenos',()=>{
      const request={kind:'detached:'+kind+'-receipted',operationId:'op-488',
        generation:8,databaseUuid:'db-pr488',payload};
      expect(isDetachedWriterRequest(request)).toBe(true);
      expect(isDetachedWriterRequest({...request,generation:0})).toBe(false);
      expect(isDetachedWriterRequest({...request,databaseUuid:''})).toBe(false);
      expect(isDetachedWriterRequest({...request,operationId:''})).toBe(false);
      expect(isDetachedWriterResponse({kind:'detached:'+response+'-receipted',
        operationId:'op-488',result})).toBe(true);
    });
  }
});
