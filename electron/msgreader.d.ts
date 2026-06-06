declare module '@kenjiuno/msgreader' {
  export class MsgReader {
    constructor(buffer: Uint8Array);
    getFileData(): {
      subject?: unknown;
      body?: unknown;
      bodyHTML?: unknown;
      html?: unknown;
      senderName?: unknown;
      senderEmail?: unknown;
      messageDeliveryTime?: unknown;
      deliveryTime?: unknown;
      creationTime?: unknown;
    } | null | undefined;
  }
}
