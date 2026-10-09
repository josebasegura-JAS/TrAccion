interface TraccionConditionalStorageBatchSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentUpdatedAt: string | null;
  failedRecordKey?: string;
  message: string;
}

interface TraccionApi {
  saveLocalStorageRecordsIfUnchanged?: (
    records: TraccionConditionalStorageRecord[],
  ) => Promise<TraccionConditionalStorageBatchSaveResult>;
}
