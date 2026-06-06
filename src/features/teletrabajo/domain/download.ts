interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface WritableFileStream {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandle {
  createWritable: () => Promise<WritableFileStream>;
}

interface WindowWithSaveFilePicker extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}

const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return await blob.arrayBuffer();
}

export async function saveDocxWithDialog(blob: Blob, fileName: string): Promise<void> {
  if (window.traccion?.openTeletrabajoWord) {
    const result = await window.traccion.openTeletrabajoWord(await blobToArrayBuffer(blob), fileName);
    if (!result.ok) {
      throw new Error(result.message || 'No se ha podido abrir el Word generado.');
    }
    return;
  }

  const windowWithPicker = window as WindowWithSaveFilePicker;

  if (windowWithPicker.showSaveFilePicker) {
    const handle = await windowWithPicker.showSaveFilePicker({
      suggestedName: fileName,
      types: [
        {
          description: 'Documento Word',
          accept: { [WORD_MIME_TYPE]: ['.docx'] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
