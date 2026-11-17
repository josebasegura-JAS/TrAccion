import { describe, expect, it, vi } from 'vitest';
import { sendReceiptBackedWriterOperation } from './receiptBackedWriterTransport.js';
import type { ReceiptedWriterRequest } from './receiptBackedWriterTransport.js';

const request:ReceiptedWriterRequest={
  kind:'detached:save-criteria-receipted', operationId:'unique-op-1',
  generation:8,databaseUuid:'sqlite-uuid',
  record:{id:'criterion',value:'{}',expectedUpdatedAt:null},
};
function fixture() {
  const log:string[]=[];
  const registerWriterOperation=vi.fn((_id:string,_gen:number,_backed:true)=>{
    log.push('journal');
  });
  const acknowledgeWriterOperation=vi.fn(()=>{log.push('ack');});
  const workerUncertain=vi.fn(()=>{log.push('quarantine');});
  const sendAndAwait=vi.fn(async()=>{
    log.push('wire');
    return {
      kind:'detached:criteria-receipted',operationId:'unique-op-1',
      result:{ok:true,message:'saved',status:{ready:true}},
    };
  });
  return {log,registerWriterOperation,acknowledgeWriterOperation,workerUncertain,sendAndAwait};
}

describe('PR501 · strict receipt-backed transport admission',()=>{
  it('writes the durable submitted record BEFORE sending, and records ACK without settling',async()=>{
    const f=fixture();
    await sendReceiptBackedWriterOperation(f,'sqlite-uuid',request);
    expect(f.log).toEqual(['journal','wire','ack']);
    expect(f.registerWriterOperation).toHaveBeenCalledWith('unique-op-1',8,true);
    expect(f.workerUncertain).not.toHaveBeenCalled();
  });

  it('never sends when journal registration fails',async()=>{
    const f=fixture();
    f.registerWriterOperation.mockImplementation(()=>{throw new Error('journal disk offline');});
    await expect(sendReceiptBackedWriterOperation(f,'sqlite-uuid',request))
      .rejects.toThrow('journal disk offline');
    expect(f.sendAndAwait).not.toHaveBeenCalled();
    expect(f.acknowledgeWriterOperation).not.toHaveBeenCalled();
  });

  it('rejects non-receipted or forged database identities before journal or wire',async()=>{
    const f=fixture();
    await expect(sendReceiptBackedWriterOperation(f,'other-uuid',request))
      .rejects.toThrow('identidad');
    await expect(sendReceiptBackedWriterOperation(f,'sqlite-uuid',{
      ...request, kind:'detached:save-task',
    } as unknown as ReceiptedWriterRequest)).rejects.toThrow('inválida');
    expect(f.registerWriterOperation).not.toHaveBeenCalled();
    expect(f.sendAndAwait).not.toHaveBeenCalled();
  });

  it('quarantines timeouts, does not retry and never writes ACK',async()=>{
    const f=fixture();
    f.sendAndAwait.mockRejectedValue(new Error('IPC timeout after possibly committed SQLite'));
    await expect(sendReceiptBackedWriterOperation(f,'sqlite-uuid',request))
      .rejects.toThrow('IPC timeout');
    expect(f.sendAndAwait).toHaveBeenCalledTimes(1);
    expect(f.workerUncertain).toHaveBeenCalledWith(8);
    expect(f.acknowledgeWriterOperation).not.toHaveBeenCalled();
  });

  it('rejects mismatched/invalid responses and quarantines even when transport resolves',async()=>{
    const f=fixture();
    f.sendAndAwait.mockResolvedValue({
      kind:'detached:criteria-receipted',operationId:'wrong-op',
      result:{ok:true,message:'saved',status:{ready:true}},
    });
    await expect(sendReceiptBackedWriterOperation(f,'sqlite-uuid',request))
      .rejects.toThrow('ACK');
    expect(f.acknowledgeWriterOperation).not.toHaveBeenCalled();
    expect(f.workerUncertain).toHaveBeenCalledOnce();
  });
});
